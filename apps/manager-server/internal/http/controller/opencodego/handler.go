package opencodego

import (
	"errors"
	"net/http"
	"strings"

	"github.com/seakee/cpa-manager-plus/apps/manager-server/internal/app"
	"github.com/seakee/cpa-manager-plus/apps/manager-server/internal/http/middleware"
	"github.com/seakee/cpa-manager-plus/apps/manager-server/internal/http/response"
	opencodegosvc "github.com/seakee/cpa-manager-plus/apps/manager-server/internal/service/opencodego"
)

type Handler struct {
	App *app.Context
}

func (h *Handler) Handle(w http.ResponseWriter, r *http.Request) {
	if !middleware.AuthorizePanel(w, r, h.App.AdminAuthService) {
		return
	}
	if r.Method != http.MethodGet {
		response.MethodNotAllowed(w)
		return
	}

	const prefix = "/v0/management/opencode-go/usage/"
	path := strings.TrimRight(r.URL.Path, "/")
	if !strings.HasPrefix(path, prefix) {
		response.MethodNotAllowed(w)
		return
	}
	entryID := strings.TrimSpace(strings.TrimPrefix(path, prefix))
	if entryID == "" {
		response.Error(w, http.StatusBadRequest, errors.New("OpenCode Go workspace entry id is required"))
		return
	}
	result, err := h.App.OpenCodeGoService.FetchUsage(r.Context(), entryID)
	if err != nil {
		response.Error(w, errorStatus(err), err)
		return
	}
	response.JSON(w, http.StatusOK, result)
}

func errorStatus(err error) int {
	switch {
	case errors.Is(err, opencodegosvc.ErrNotConfigured):
		return http.StatusPreconditionFailed
	case errors.Is(err, opencodegosvc.ErrEntryNotFound):
		return http.StatusNotFound
	default:
		return http.StatusBadGateway
	}
}
