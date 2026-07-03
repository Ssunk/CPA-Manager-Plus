package opencodego

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/seakee/cpa-manager-plus/apps/manager-server/internal/model"
	managerconfigsvc "github.com/seakee/cpa-manager-plus/apps/manager-server/internal/service/managerconfig"
	"github.com/seakee/cpa-manager-plus/apps/manager-server/internal/store"
)

type fakeManagerConfigResolver struct {
	cfg store.ManagerConfig
	ok  bool
	err error
}

func (f fakeManagerConfigResolver) ResolveManagerConfigWithSource(context.Context) (store.ManagerConfig, managerconfigsvc.Source, bool, error) {
	return f.cfg, managerconfigsvc.SourceDB, f.ok, f.err
}

func TestParseUsageHTMLExtractsSSRUsage(t *testing.T) {
	html := `<script>_$HY.r["lite.subscription.get[\"wrk_test\"]"]={rollingUsage:$R[1]={status:"ok",resetInSec:17901,usagePercent:0},weeklyUsage:$R[2]={status:"ok",resetInSec:298223,usagePercent:74},monthlyUsage:$R[3]={status:"ok",resetInSec:652339,usagePercent:51},mine:!0}</script>`

	usage, err := ParseUsageHTML(html, "wrk_test")
	if err != nil {
		t.Fatalf("parse usage: %v", err)
	}
	if usage.RollingUsage.UsagePercent != 0 || usage.WeeklyUsage.UsagePercent != 74 || usage.MonthlyUsage.UsagePercent != 51 {
		t.Fatalf("usage = %#v", usage)
	}
	if usage.WeeklyUsage.ResetInSec != 298223 || usage.WeeklyUsage.Status != "ok" {
		t.Fatalf("weekly usage = %#v", usage.WeeklyUsage)
	}
}

func TestParseUsageHTMLMissingUsageReturnsError(t *testing.T) {
	if _, err := ParseUsageHTML("<html></html>", "wrk_missing"); err != ErrParseUsage {
		t.Fatalf("err = %v, want ErrParseUsage", err)
	}
}

func TestOpenCodeAuthCookieValueAcceptsFullCookieHeader(t *testing.T) {
	for _, tc := range []struct {
		name string
		raw  string
		want string
	}{
		{name: "raw value", raw: "Fe26.value", want: "Fe26.value"},
		{name: "auth assignment", raw: "auth=Fe26.value", want: "Fe26.value"},
		{name: "full cookie header", raw: "oc_locale=zh; auth=Fe26.value; other=x", want: "Fe26.value"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if got := model.OpenCodeAuthCookieValue(tc.raw); got != tc.want {
				t.Fatalf("value = %q, want %q", got, tc.want)
			}
		})
	}
}

func TestServiceFetchUsageRequestsWorkspaceWithCookies(t *testing.T) {
	observed := make(chan *http.Request, 1)
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		observed <- r
		w.Header().Set("Content-Type", "text/html")
		_, _ = w.Write([]byte(`rollingUsage:{status:"ok",resetInSec:1,usagePercent:2},weeklyUsage:{status:"ok",resetInSec:3,usagePercent:4},monthlyUsage:{status:"ok",resetInSec:5,usagePercent:6}`))
	}))
	t.Cleanup(upstream.Close)

	cfg := store.ManagerConfig{
		OpenCodeGo: store.ManagerOpenCodeGoConfig{
			Entries: []store.ManagerOpenCodeGoEntry{
				{
					ID:          "entry-1",
					Label:       "Main",
					WorkspaceID: "wrk_test",
					AuthCookie:  "cookie-value",
					Enabled:     true,
					BaseURL:     upstream.URL,
				},
			},
		},
	}
	service := NewWithClient(fakeManagerConfigResolver{cfg: cfg, ok: true}, upstream.Client())

	usage, err := service.FetchUsage(context.Background(), "entry-1")
	if err != nil {
		t.Fatalf("fetch usage: %v", err)
	}
	if usage.ID != "entry-1" || usage.Label != "Main" || usage.WorkspaceID != "wrk_test" {
		t.Fatalf("usage identity = %#v", usage)
	}
	got := <-observed
	if got.URL.Path != "/workspace/wrk_test/go" {
		t.Fatalf("path = %q", got.URL.Path)
	}
	if cookie, err := got.Cookie("auth"); err != nil || cookie.Value != "cookie-value" {
		t.Fatalf("auth cookie = %#v err=%v", cookie, err)
	}
	if cookie, err := got.Cookie("oc_locale"); err != nil || cookie.Value != "zh" {
		t.Fatalf("locale cookie = %#v err=%v", cookie, err)
	}
}
