package opencodego

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/seakee/cpa-manager-plus/apps/manager-server/internal/model"
	managerconfigsvc "github.com/seakee/cpa-manager-plus/apps/manager-server/internal/service/managerconfig"
	"github.com/seakee/cpa-manager-plus/apps/manager-server/internal/store"
)

var (
	ErrNotConfigured = errors.New("OpenCode Go is not configured")
	ErrEntryNotFound = errors.New("OpenCode Go workspace entry not found")
	ErrParseUsage    = errors.New("OpenCode Go usage data not found")
)

type managerConfigResolver interface {
	ResolveManagerConfigWithSource(ctx context.Context) (store.ManagerConfig, managerconfigsvc.Source, bool, error)
}

type Service struct {
	managerConfig managerConfigResolver
	client        *http.Client
}

func New(managerConfig managerConfigResolver) *Service {
	return &Service{
		managerConfig: managerConfig,
		client: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

func NewWithClient(managerConfig managerConfigResolver, client *http.Client) *Service {
	service := New(managerConfig)
	if client != nil {
		service.client = client
	}
	return service
}

func (s *Service) FetchUsage(ctx context.Context, entryID string) (model.OpenCodeGoUsageResponse, error) {
	cfg, _, ok, err := s.managerConfig.ResolveManagerConfigWithSource(ctx)
	if err != nil {
		return model.OpenCodeGoUsageResponse{}, err
	}
	if !ok || len(cfg.OpenCodeGo.Entries) == 0 {
		return model.OpenCodeGoUsageResponse{}, ErrNotConfigured
	}

	entryID = strings.TrimSpace(entryID)
	for _, entry := range cfg.OpenCodeGo.Entries {
		if strings.TrimSpace(entry.ID) != entryID {
			continue
		}
		if !entry.Enabled || strings.TrimSpace(entry.WorkspaceID) == "" || strings.TrimSpace(entry.AuthCookie) == "" {
			return model.OpenCodeGoUsageResponse{}, ErrNotConfigured
		}
		return s.fetchEntryUsage(ctx, entry)
	}
	return model.OpenCodeGoUsageResponse{}, ErrEntryNotFound
}

func (s *Service) fetchEntryUsage(ctx context.Context, entry store.ManagerOpenCodeGoEntry) (model.OpenCodeGoUsageResponse, error) {
	baseURL := strings.TrimRight(strings.TrimSpace(entry.BaseURL), "/")
	if baseURL == "" {
		baseURL = model.DefaultOpenCodeGoBaseURL
	}
	parsed, err := url.Parse(baseURL + "/workspace/" + url.PathEscape(strings.TrimSpace(entry.WorkspaceID)) + "/go")
	if err != nil {
		return model.OpenCodeGoUsageResponse{}, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, parsed.String(), nil)
	if err != nil {
		return model.OpenCodeGoUsageResponse{}, err
	}
	req.AddCookie(&http.Cookie{Name: "auth", Value: model.OpenCodeAuthCookieValue(entry.AuthCookie)})
	req.AddCookie(&http.Cookie{Name: "oc_locale", Value: "zh"})

	resp, err := s.client.Do(req)
	if err != nil {
		return model.OpenCodeGoUsageResponse{}, err
	}
	defer func() {
		_, _ = io.Copy(io.Discard, resp.Body)
		_ = resp.Body.Close()
	}()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return model.OpenCodeGoUsageResponse{}, fmt.Errorf("OpenCode Go request failed with status %d", resp.StatusCode)
	}
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return model.OpenCodeGoUsageResponse{}, err
	}
	usage, err := ParseUsageHTML(string(body), entry.WorkspaceID)
	if err != nil {
		return model.OpenCodeGoUsageResponse{}, err
	}
	usage.ID = entry.ID
	usage.Label = entry.Label
	usage.WorkspaceID = entry.WorkspaceID
	usage.FetchedAtMS = time.Now().UnixMilli()
	return usage, nil
}

func ParseUsageHTML(html string, workspaceID string) (model.OpenCodeGoUsageResponse, error) {
	scope := html
	if workspaceID = strings.TrimSpace(workspaceID); workspaceID != "" {
		marker := `lite.subscription.get[\"` + workspaceID + `\"]`
		if idx := strings.Index(html, marker); idx >= 0 {
			start := idx - 12000
			if start < 0 {
				start = 0
			}
			end := idx + 12000
			if end > len(html) {
				end = len(html)
			}
			scope = html[start:end]
		}
	}

	usage, ok := parseUsageScope(scope)
	if ok {
		return usage, nil
	}
	if scope != html {
		if usage, ok := parseUsageScope(html); ok {
			return usage, nil
		}
	}
	return model.OpenCodeGoUsageResponse{}, ErrParseUsage
}

var usageSerovalObjectPattern = regexp.MustCompile(`(?s)(rollingUsage|weeklyUsage|monthlyUsage)\s*:\s*\$R\[\d+\]\s*=\s*\{([^{}]*)\}`)
var usagePlainObjectPattern = regexp.MustCompile(`(?s)(rollingUsage|weeklyUsage|monthlyUsage)\s*:\s*\{([^{}]*)\}`)
var statusPattern = regexp.MustCompile(`status\s*:\s*["']([^"']+)["']`)
var resetPattern = regexp.MustCompile(`resetInSec\s*:\s*(-?\d+)`)
var usagePercentPattern = regexp.MustCompile(`usagePercent\s*:\s*(-?\d+)`)

func parseUsageScope(scope string) (model.OpenCodeGoUsageResponse, bool) {
	if usage, ok := parseUsageWithPattern(scope, usageSerovalObjectPattern); ok {
		return usage, true
	}
	return parseUsageWithPattern(scope, usagePlainObjectPattern)
}

func parseUsageWithPattern(scope string, pattern *regexp.Regexp) (model.OpenCodeGoUsageResponse, bool) {
	var result model.OpenCodeGoUsageResponse
	seen := map[string]bool{}
	for _, match := range pattern.FindAllStringSubmatch(scope, -1) {
		if len(match) != 3 {
			continue
		}
		window, ok := parseUsageWindow(match[2])
		if !ok {
			continue
		}
		switch match[1] {
		case "rollingUsage":
			result.RollingUsage = window
		case "weeklyUsage":
			result.WeeklyUsage = window
		case "monthlyUsage":
			result.MonthlyUsage = window
		}
		seen[match[1]] = true
	}
	return result, seen["rollingUsage"] && seen["weeklyUsage"] && seen["monthlyUsage"]
}

func parseUsageWindow(raw string) (model.OpenCodeUsageWindow, bool) {
	statusMatch := statusPattern.FindStringSubmatch(raw)
	resetMatch := resetPattern.FindStringSubmatch(raw)
	usageMatch := usagePercentPattern.FindStringSubmatch(raw)
	if len(statusMatch) != 2 || len(resetMatch) != 2 || len(usageMatch) != 2 {
		return model.OpenCodeUsageWindow{}, false
	}
	resetInSec, err := strconv.ParseInt(resetMatch[1], 10, 64)
	if err != nil {
		return model.OpenCodeUsageWindow{}, false
	}
	usagePercent, err := strconv.Atoi(usageMatch[1])
	if err != nil {
		return model.OpenCodeUsageWindow{}, false
	}
	return model.OpenCodeUsageWindow{
		Status:       statusMatch[1],
		ResetInSec:   resetInSec,
		UsagePercent: usagePercent,
	}, true
}
