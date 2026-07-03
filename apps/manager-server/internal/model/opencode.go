package model

import "strings"

const DefaultOpenCodeGoBaseURL = "https://opencode.ai"

// OpenCodeUsageWindow represents one quota window.
type OpenCodeUsageWindow struct {
	Status       string `json:"status"`
	ResetInSec   int64  `json:"resetInSec"`
	UsagePercent int    `json:"usagePercent"`
}

type OpenCodeGoUsageResponse struct {
	ID           string              `json:"id"`
	Label        string              `json:"label"`
	WorkspaceID  string              `json:"workspaceId"`
	FetchedAtMS  int64               `json:"fetchedAtMs"`
	RollingUsage OpenCodeUsageWindow `json:"rollingUsage"`
	WeeklyUsage  OpenCodeUsageWindow `json:"weeklyUsage"`
	MonthlyUsage OpenCodeUsageWindow `json:"monthlyUsage"`
}

func OpenCodeAuthCookieValue(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	for _, part := range strings.Split(raw, ";") {
		name, value, ok := strings.Cut(strings.TrimSpace(part), "=")
		if ok && strings.EqualFold(strings.TrimSpace(name), "auth") {
			return strings.TrimSpace(value)
		}
	}
	if name, value, ok := strings.Cut(raw, "="); ok && strings.EqualFold(strings.TrimSpace(name), "auth") {
		return strings.TrimSpace(value)
	}
	return raw
}
