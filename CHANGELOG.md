# Changelog

All notable changes to this project. Each entry corresponds to one
delivered batch. Files are listed in the order they were added/modified.

---
## Batch 16 — LLM Provider Fallback Chain
- backend/app/config.py (patch — add llm_fallback_* settings and
    validation)
- .env.example (patch — document LLM_FALLBACK_* vars)
- backend/app/services/llm/gemini.py (patch — __init__ accepts api_key
    and model kwargs)
- backend/app/services/llm/anthropic.py (patch — __init__ accepts
    api_key and model kwargs)
- backend/app/services/llm/openai_compat.py (patch — __init__ accepts
    api_key, model, and base_url kwargs)
- backend/app/services/llm/fallback.py (new — FallbackProvider wraps
    two LLMProviders; silently retries on generate() or stream()
    connection failures)
- backend/app/services/llm/factory.py (rewrite — builds primary and
    optional fallback from settings)
- backend/tests/test_llm_fallback.py (new — 3 tests: generate fallback,
    stream fallback on connection error, no mid-stream fallback
    duplication)
- Result: 98 backend tests green.

## Batch 1.6 — React component smoke tests
- frontend/package.json (patch — added @testing-library/react,
    @testing-library/user-event, @testing-library/jest-dom)
- frontend/src/test/setup.ts (patch — RTL cleanup + jest-dom matchers)
- frontend/src/features/chat/components/Composer.test.tsx (new — 6 tests:
    render, disable state, Enter submission, Cmd+Enter, Cancel button,
    Guest mode gating)
- frontend/src/features/chat/components/AgentRail.test.tsx (new — 4
    tests: empty state null, render chips/timers, toggle expand/collapse,
    error state rendering)
- Result: 75 frontend tests green.

## Batch 1.5 — SSE client tests
- frontend/src/lib/sse.test.ts (new — 14 tests: happy path, multiple
    events, multi-line data, non-JSON fallback, CRLF normalization,
    trailing frame without blank line, split UTF-8 byte decoding,
    Authorization header, onError on HTTP fail / network fail,
    AbortError during fetch / stream read (silent exit))

## Batch 1.4a — Security audit remediation
- frontend/package.json (patch — vitest ^2.1.0 → ^4.1.12,
    @vitest/coverage-v8 ^2.1.0 → ^4.1.12, vite ^6.0.0 → ^6.4.0;
    added overrides: { "dompurify": ">=3.4.16" })
- frontend/vitest.config.ts (patch — confirm coverage.include is set;
    vitest 4 removed coverage.all)
- Resolved: tinypool critical RCE (CVE-2026-104848/9) via vitest 4
    upgrade; dompurify XSS (GHSA-p98j, GHSA-6688) via overrides.
- Result: 0 npm audit vulnerabilities.

## Batch 1.4 — Frontend test scaffold
- frontend/package.json (patch — vitest, @vitest/coverage-v8, jsdom
    devDeps; test/test:watch/test:coverage scripts)
- frontend/tsconfig.json (patch — include vitest.config.ts, drop
    deprecated baseUrl)
- frontend/vitest.config.ts (new — jsdom env, @ alias, coverage scoped
    to 5 tested files, threshold gates)
- frontend/src/test/setup.ts (new — afterEach: clearAllMocks,
    unstubAllGlobals, useRealTimers)
- frontend/src/lib/http.test.ts (new — 13 tests: error branches,
    auth header injection, guest-gate open/closed)
- frontend/src/features/filters/encoding.test.ts (new — 9 tests)
- frontend/src/features/execute/format.test.ts (new — 7 tests)
- frontend/src/shared/utils/time.test.ts (new — 11 tests)
- frontend/src/shared/utils/cn.test.ts (new — 7 tests)
- .github/workflows/security.yml (patch — adds frontend-tests job)
- frontend/src/lib/http.ts (patch — fixed parseError body-consumed-once
    bug preventing text fallback on non-JSON errors)

## Batch 1.3 — Orchestrator E2E tests
- backend/tests/test_orchestrator_e2e.py (new — 15 tests: SSE stream
    structure (event order, artifacts, narrative deltas), run
    persistence (status, sql_text, elapsed_ms), filters applied at
    DuckDB-view level, conversation_id persistence, error paths (no
    datasets, invalid SQL, LLM failure). FakeLLM returns a "kitchen
    sink" JSON so any agent extracts its own slice regardless of system-
    prompt wording. Fail-by-call-number for error injection)

## Batch 1.2 — Full auth flow test
- backend/tests/test_auth_flow.py (new — 21 tests: register, login,
    /auth/me, full password reset cycle, single-use token, expired token,
    invalid token, weak password, duplicate email/username, email-
    enumeration resistance; `auth_on` fixture enables auth per-test via
    monkeypatch, speeds bcrypt to round 4, disables backoff, exposes
    reset_url)

## Batch 1.1 — CI wiring + upload round-trip tests
- .github/workflows/security.yml (move from `Security.txt` + patch —
    adds `backend-tests` job: pytest + coverage artifact upload, Python
    3.12, 10-min timeout)
- backend/tests/test_upload_roundtrip.py (new — 10 tests: CSV / JSON /
    Parquet happy paths, magic-byte rejection × 2, size cap, BOM strip
    unit + e2e, upload→GET→DELETE→404 cycle, on-disk cleanup)

## Batch 1.0 — Test foundation
- backend/requirements-dev.txt (patch — add pytest, pytest-asyncio,
    pytest-cov, httpx; keep pip-audit, pre-commit, ruff)
- backend/pytest.ini (new — testpaths, asyncio auto, strict markers)
- backend/pyproject.toml (patch — rewritten with clean UTF-8, no BOM,
    to fix Unicode-invisible-character parse failure)
- backend/tests/__init__.py (new)
- backend/tests/conftest.py (new — env setup via os.environ[...] = value
    (not setdefault — developer shell/.env would silently win); temp-file
    SQLite (not :memory: — engine is created at import with default
    pooling); get_settings.cache_clear() after env set)
- backend/tests/test_smoke.py (new — config validators, module imports,
    env-isolation regression guard)
- backend/tests/test_routes.py (new — all 18 router prefixes reachable)
- backend/tests/test_api_smoke.py (new — health, auth config, anonymous
    user via /auth/me, root, openapi, docs-off, 404)
- backend/tests/test_security_helpers.py (new — SSRF × 9, crypto × 3,
    file signatures × 11, sanitizer × 4, DB-error classifier × 5)
- backend/scripts/test.ps1 (new — Windows runner, -Coverage switch)
- backend/scripts/test.sh (new — POSIX runner)

## Batch 0.2 — Documentation reconciliation
- README.md (rewrite — replace marketing page with functional docs
    matching current codebase: 18 routers, 7 agents, 12 services, Batches
    1–83 + 1.0; Python 3.14 verified; remove "45% under construction")
- HANDOFF.md (rewrite — reflect Batches through 83; add testing,
    deployment target, real pending list; remove stale batch-68 claims)
- SECURITY.md (patch — Batch 84 re-baseline; R1 escalated Low→Medium;
    R11 (test coverage) and R12 (CI workflow) closed)
- CHANGELOG.md (patch — this entry; remove false "Pending" duplicates)

## Batch 0.1 — Structural audit
- Read-only audit of project tree vs. docs. Findings:
    - 7 agents (not 6/8 — anomaly is a service, not an agent)
    - 18 routers mounted under /api/v1 (route list verified)
    - 12 services (agent + non-agent) present
    - All "Pending" entries 38, 43, 44, 56, 57, 58, 59, 65 verified
      shipped by file tree
    - `news` feature exists but was never logged in CHANGELOG
    - `TemplateSuggestions.tsx`, `shared/utils/time.ts`, `scripts/audit.ps1`
      present but unlogged
    - No tests, no CI workflows, no Dockerfile / docker-compose.yml

## Batch 7 (post) — Route-table introspection fix
- backend/app/core/route_audit.py (new — version-agnostic route
    enumeration via fastapi.routing.iter_route_contexts; startup guard)
- backend/app/main.py (patch — call audit_routes(app) in lifespan)
- SECURITY.md (patch — R2 closed: FastAPI 0.137+ lazy include_router,
    not a Glassbox bug)

## Batch 7 — Final security review
- backend/app/config.py (patch — validate_ranges(); validate_llm() now
    called at startup; refuse boot when APP_ENV=production with
    APP_DEBUG=true or AUTH_SHOW_RESET_LINK=true)
- backend/app/main.py (patch — wire validate_ranges + validate_llm into
    lifespan)
- .env.example (doc — values are validated at startup)
- backend/app/core/file_signature.py (patch — accept UTF-16 LE/BE with
    BOM in text signature check, so CSV normalization can run)
- backend/app/api/v1/datasets.py (patch — commit-failure cleanup via
    _cleanup_upload_group; sanitize_message on DB error; column_stats
    routed through execute_with_timeout; silent except blocks now log)
- backend/app/services/duckdb_service.py (patch — run_with_timeout +
    execute_with_timeout; query() runs under QUERY_TIMEOUT_SECONDS)
- backend/app/api/v1/execute.py (patch — sanitize_message on 4 client-
    facing str(e) leaks; TimeoutError branch on /sql)

## Batch 6 — File upload hardening
- backend/app/core/file_signature.py (new — magic-byte verification)
- backend/app/api/v1/datasets.py (patch — streaming size cap via _read_capped,
    UTF-8 BOM strip on upload, effective file_path storage, cleanup on
    delete/profiling failure)
- backend/app/services/duckdb_service.py (patch — _strip_bom_in_place()
    called from register_file)

## Batch 44 — Column-level drill-down
- backend/app/schemas/__init__.py (append — HistogramBucket, TopValue, ColumnStatsResponse)
- backend/app/api/v1/datasets.py (patch — GET /datasets/{id}/columns/{name})
- frontend/src/features/datasets/column-api.ts (new)
- frontend/src/features/datasets/components/ColumnModal.tsx (new)
- frontend/src/features/datasets/components/DatasetCard.tsx (rewrite — clickable column chips)

## Batch 83 — Guest / demo mode
- .env.example, .env (append — GUEST_MODE)
- backend/app/config.py (patch — guest_mode setting)
- backend/app/dependencies/auth.py (rewrite — guest browse, blocked writes)
- backend/app/api/v1/auth.py (patch — expose guest_mode in /config)
- frontend/src/features/auth/api.ts (patch — guest_mode on AuthConfig)
- frontend/src/features/auth/store.ts (patch — isGuestNow helper, guest_mode fallback)
- frontend/src/features/auth/guest-gate.ts (new)
- frontend/src/features/auth/components/GuestBanner.tsx (new)
- frontend/src/features/auth/components/GuestSignInPrompt.tsx (new)
- frontend/src/features/auth/components/ProtectedRoute.tsx (rewrite — allow guests through)
- frontend/src/lib/http.ts (patch — 403 → open guest modal)
- frontend/src/features/chat/components/Composer.tsx (patch — preempt guest runs)
- frontend/src/app/layouts/AppShell.tsx (rewrite — mount banner + prompt)

## Batch 82B — Landing content sections
- frontend/src/features/landing/components/HowItWorks.tsx (new)
- frontend/src/features/landing/components/StatsStrip.tsx (new)
- frontend/src/features/landing/components/LiveDemo.tsx (new)
- frontend/src/features/landing/components/TechStack.tsx (new)
- frontend/src/features/landing/components/FAQ.tsx (new)
- frontend/src/features/landing/components/FinalCTA.tsx (new)
- frontend/src/features/landing/pages/LandingPage.tsx (patch — mount all sections)

## Batch 82A — Landing motion foundation + animated hero
- frontend/src/features/landing/hooks.ts (new)
- frontend/src/features/landing/components/ScrollProgress.tsx (new)
- frontend/src/features/landing/components/AuroraBackground.tsx (new)
- frontend/src/features/landing/components/AnimatedHero.tsx (new)
- frontend/src/features/landing/components/ScrollReveal.tsx (new)
- frontend/index.css (append — motion system)
- frontend/src/features/landing/pages/LandingPage.tsx (rewrite)

## Batch 43 — Multi-file upload
- frontend/src/features/datasets/components/UploadDropzone.tsx (rewrite — queue, concurrency pool, per-file retry)

## Batch 38 — Saved analyses / pinning
- backend/app/db/models.py (patch — `pinned`, `pinned_at` on AnalysisRun; `to_summary`)
- backend/app/db/session.py (patch — `_migrate_add_pinned`)
- backend/app/schemas/__init__.py (append — `PinRequest`)
- backend/app/api/v1/runs.py (patch — `GET /runs/pinned`, `POST /runs/{id}/pin`)
- frontend/src/features/history/api.ts (rewrite — pinned fields, `listPinned`, `setPinned`)
- frontend/src/features/history/components/PinButton.tsx (new)
- frontend/src/features/history/pages/HistoryPage.tsx (rewrite — star on each row, pinned counter)
- frontend/src/features/history/pages/RunDetailPage.tsx (patch — Pin button in actions)
- frontend/src/features/chat/pages/WorkspacePage.tsx (patch — Pin chip when done)
- frontend/src/features/home/components/PinnedRuns.tsx (new)
- frontend/src/features/chat/pages/HomePage.tsx (patch — mount `PinnedRuns`)

## Batch 65 — Onboarding tour
- frontend/src/features/onboarding/store.ts (new)
- frontend/src/features/onboarding/steps.ts (new)
- frontend/src/features/onboarding/OnboardingTour.tsx (new)
- frontend/src/app/layouts/AppShell.tsx (patch — mount tour + auto-start on first visit)
- frontend/src/app/layouts/LeftRail.tsx (patch — `data-tour` attrs)
- frontend/src/app/layouts/TopBar.tsx (patch — `data-tour` attrs)
- frontend/src/features/chat/pages/HomePage.tsx (patch — `data-tour` attrs)
- frontend/src/features/command-palette/CommandPalette.tsx (patch — "Restart tour" action)

## Batch 59 — Global keyboard shortcuts
- frontend/src/features/shortcuts/store.ts (new)
- frontend/src/features/shortcuts/registry.ts (new)
- frontend/src/features/shortcuts/useGlobalShortcuts.ts (new)
- frontend/src/features/shortcuts/ShortcutsModal.tsx (new)
- frontend/src/app/layouts/AppShell.tsx (patch — mount hook + modal)
- frontend/src/features/command-palette/CommandPalette.tsx (patch — "Show keyboard shortcuts" action)

## Batch 58 — Inline-ask in ⌘K palette
- frontend/src/features/command-palette/CommandPalette.tsx (rewrite — ask item, shift+enter, dashboard/settings nav)
- frontend/src/features/chat/pages/WorkspacePage.tsx (patch — auto-fire effect watches `q` param)

## Batch 55 — Brand assets & logo
- frontend/public/site.webmanifest (new)
- frontend/public/logo-mark.png (new — user-supplied)
- frontend/public/favicon.ico (new — user-supplied)
- frontend/public/favicon-32x32.png (new — user-supplied)
- frontend/public/favicon-16x16.png (new — user-supplied)
- frontend/public/apple-touch-icon.png (new — user-supplied)
- frontend/public/og-image.png (new — user-supplied)
- frontend/index.html (rewrite — icons, manifest, OG tags, no-flash script)
- frontend/src/app/layouts/LeftRail.tsx (patch — real logo image)
- frontend/src/features/auth/pages/LoginPage.tsx (patch — real logo image)
- frontend/src/features/auth/pages/ForgotPasswordPage.tsx (patch — real logo image)
- frontend/src/features/auth/pages/ResetPasswordPage.tsx (patch — real logo image)

## Batch 57 — SQL formatter
- frontend/package.json (patch — `sql-formatter`)
- frontend/src/features/execute/format.ts (new — `formatSql`, `canFormat`)
- frontend/src/features/inspector/components/SqlPanel.tsx (patch — Format chip)
- frontend/src/features/chat/components/AnswerStream.tsx (patch — Format chip + local `displaySql` state)

## Batch 56 — Dark/light theme toggle
- frontend/index.html (rewrite — inline no-flash theme script)
- frontend/src/index.css (rewrite — CSS variable theme system + `@theme inline`)
- frontend/src/features/theme/store.ts (new — zustand theme store)
- frontend/src/features/theme/ThemeProvider.tsx (new — applies `data-theme`)
- frontend/src/features/theme/ThemeToggle.tsx (new — sun/moon button)
- frontend/src/App.tsx (patch — wrap with `ThemeProvider`)
- frontend/src/app/layouts/TopBar.tsx (patch — mount toggle, theme-aware header)

## Batch 74 — Auto-dashboard
- backend/app/schemas/__init__.py (append)
- backend/app/services/dashboard_service.py (new)
- backend/app/api/v1/dashboard.py (new)
- backend/app/api/v1/router.py (patch)
- frontend/src/features/dashboard/api.ts (new)
- frontend/src/features/dashboard/components/DashboardPanel.tsx (new)
- frontend/src/features/dashboard/pages/DashboardPage.tsx (new)

## Batch 68 — Anomaly detection
- backend/app/db/models.py (append `AnomalyNarrativesCache`)
- backend/app/services/anomaly_service.py (new)
- backend/app/prompts/__init__.py (append)
- backend/app/services/orchestrator.py (patch — new `anomalies` step)
- frontend/src/features/chat/types.ts (append `Anomaly`, `AnomaliesArtifact`)
- frontend/src/features/charts/components/AnomalyCard.tsx (new)

## Batch 79 — Agent rail collapse & animation
- frontend/src/features/chat/components/AgentRail.tsx (rewrite)

## Batch 60 — Chart drill-down
- backend/app/schemas/__init__.py (append)
- backend/app/api/v1/drilldown.py (new)
- backend/app/api/v1/router.py (patch)
- frontend/src/features/charts/api.ts (new)
- frontend/src/features/charts/components/DrilldownModal.tsx (new)
- frontend/src/features/charts/components/ChartRenderer.tsx (rewrite)

## Batch 62 — Query history autocomplete
- backend/app/api/v1/suggestions.py (rewrite — adds `/history`)
- frontend/src/features/suggestions/history-api.ts (new)
- frontend/src/features/suggestions/useQuestionHistory.ts (new)
- frontend/src/features/suggestions/components/HistoryAutocomplete.tsx (new)
- frontend/src/features/chat/components/Composer.tsx (rewrite)

## Batch 66 — Auto-suggest next questions
- backend/app/db/models.py (append `NextQuestionsCache`)
- backend/app/prompts/__init__.py (append)
- backend/app/services/next_questions_service.py (new)
- backend/app/schemas/__init__.py (append)
- backend/app/services/orchestrator.py (patch — new `suggest` step)
- frontend/src/features/chat/types.ts (append `NextQuestionsArtifact`)
- frontend/src/features/suggestions/components/NextQuestions.tsx (new)

## Batch 72 — Thread mode (chat-style workspace)
- backend/app/api/v1/conversations.py (new)
- backend/app/api/v1/router.py (patch)
- frontend/src/features/chat/thread-store.ts (new)
- frontend/src/features/chat/api.ts (patch — `fetchConversationRuns`)
- frontend/src/features/chat/components/chat-thread/ChatMessage.tsx (new)
- frontend/src/features/chat/components/chat-thread/helpers.ts (new)
- frontend/src/features/chat/components/chat-thread/ChatThreadView.tsx (new)
- frontend/src/features/chat/pages/WorkspacePage.tsx (rewrite)

## Batch 67 — "Why this query" rationale
- backend/app/db/models.py (append `SqlRationale`)
- backend/app/prompts/__init__.py (append)
- backend/app/services/rationale_service.py (new)
- backend/app/schemas/__init__.py (append)
- backend/app/api/v1/explain.py (rewrite — adds `/why`)
- frontend/src/features/explain/api.ts (patch)
- frontend/src/features/explain/hooks.ts (patch)
- frontend/src/features/explain/components/SqlRationale.tsx (new)

## Batch 61 — "Explain this SQL" button
- backend/app/db/models.py (append `SqlExplanation`)
- backend/app/prompts/__init__.py (append)
- backend/app/services/explain_service.py (new)
- backend/app/schemas/__init__.py (append)
- backend/app/api/v1/explain.py (new)
- backend/app/api/v1/router.py (patch)
- frontend/src/features/explain/api.ts (new)
- frontend/src/features/explain/hooks.ts (new)
- frontend/src/features/explain/components/SqlExplanation.tsx (new)

## Batch 31 — Audit log
- backend/app/db/models.py (append `AuditEvent`)
- backend/app/core/audit.py (new)
- backend/app/schemas/__init__.py (append)
- backend/app/api/v1/audit.py (new)
- backend/app/api/v1/router.py (patch)
- frontend/src/features/audit/api.ts (new)
- frontend/src/features/audit/pages/AuditPage.tsx (new)

## Batch 81 — Filter bar (DuckDB-level filtering)
- backend/app/schemas/__init__.py (append `FilterCondition`, `ColumnInfo`)
- backend/app/services/duckdb_service.py (patch — `build_filter_where`, filter-aware `register_file`)
- backend/app/services/orchestrator.py (patch — accept filters, wrap source views)
- backend/app/api/v1/chat.py (patch — pass filters)
- backend/app/api/v1/columns.py (new)
- backend/app/api/v1/router.py (patch)
- frontend/src/features/filters/types.ts (new)
- frontend/src/features/filters/api.ts (new)
- frontend/src/features/filters/encoding.ts (new)
- frontend/src/features/filters/components/FilterEditor.tsx (new)
- frontend/src/features/filters/components/FilterBar.tsx (new)

## Batch 30 — DAX generation
- backend/app/prompts/__init__.py (append `DAX_SYSTEM`)
- backend/app/agents/dax_agent.py (new)
- backend/app/agents/__init__.py (patch)
- backend/app/db/models.py (patch — `dax_text` on AnalysisRun)
- backend/app/db/session.py (patch — migration)
- backend/app/services/orchestrator.py (patch — new `translate` step)
- backend/app/schemas/__init__.py (patch)
- backend/app/api/v1/execute.py (patch — save handler)
- frontend/src/features/chat/types.ts (append `DaxArtifact`)
- frontend/src/features/execute/components/MonacoEditor.tsx (patch — DAX language)
- frontend/src/features/inspector/components/DaxPanel.tsx (new)
- frontend/src/features/inspector/components/Inspector.tsx (patch — 5th tab)

## Batch 29 — Password reset flow + show/hide toggle
- .env.example, .env (append reset settings)
- backend/app/config.py (append)
- backend/app/db/models.py (append `PasswordResetToken`)
- backend/app/core/security.py (append reset helpers)
- backend/app/schemas/__init__.py (append)
- backend/app/api/v1/auth.py (rewrite — adds forgot/reset)
- frontend/src/features/auth/api.ts (patch)
- frontend/src/features/auth/components/PasswordInput.tsx (new)
- frontend/src/features/auth/pages/LoginPage.tsx (rewrite)
- frontend/src/features/auth/pages/ForgotPasswordPage.tsx (new)
- frontend/src/features/auth/pages/ResetPasswordPage.tsx (new)

## Batch 36 — Email password reset (SMTP)
- backend/requirements.txt (append `aiosmtplib`)
- .env.example, .env (append SMTP block)
- backend/app/config.py (append)
- backend/app/core/email.py (new)
- backend/app/emails/__init__.py (new)
- backend/app/emails/password_reset.py (new)
- backend/app/api/v1/auth.py (patch — send email)
- frontend/src/features/auth/api.ts (patch)
- frontend/src/features/auth/store.ts (patch)
- frontend/src/features/auth/pages/ForgotPasswordPage.tsx (rewrite)

## Batch 32 — Rate limiting
- backend/requirements.txt (append `slowapi`)
- .env.example, .env (append rate-limit block)
- backend/app/config.py (append)
- backend/app/core/rate_limit.py (new)
- backend/app/main.py (rewrite — register limiter)
- backend/app/api/v1/auth.py (patch — decorators)
- backend/app/api/v1/chat.py (patch)
- backend/app/api/v1/execute.py (patch)
- frontend/src/lib/http.ts (patch — 429 handling)

## Batch 28 — Settings page
- backend/app/api/v1/system.py (new)
- backend/app/api/v1/router.py (patch)
- frontend/src/features/settings/api.ts (new)
- frontend/src/features/settings/pages/SettingsPage.tsx (new)

## Batch 26 — Multi-turn conversation context
- backend/app/db/models.py (patch — `conversation_id`)
- backend/app/db/session.py (patch — migration)
- backend/app/services/context_service.py (new)
- backend/app/prompts/__init__.py (patch)
- backend/app/agents/sql_agent.py (patch — accept context)
- backend/app/services/orchestrator.py (patch)
- backend/app/api/v1/chat.py (patch)

## Batch 25 — Business glossary (Metrics)
- backend/app/db/models.py (append `Metric`)
- backend/app/db/session.py (append seeder)
- backend/app/schemas/__init__.py (append)
- backend/app/api/v1/metrics.py (new)
- backend/app/api/v1/router.py (patch)
- backend/app/services/semantic_service.py (new)
- backend/app/prompts/__init__.py (patch — glossary injection)
- backend/app/agents/sql_agent.py (patch)
- backend/app/services/orchestrator.py (patch)

## Batch 24 — Persist edits + command palette
- backend/app/schemas/__init__.py (append `SaveEditedRunRequest`)
- backend/app/api/v1/execute.py (patch — `/save`)
- frontend/src/features/execute/api.ts (rewrite)
- frontend/src/features/command-palette/CommandPalette.tsx (new)
- frontend/src/app/layouts/AppShell.tsx (patch)

## Batch 23 — Edit-and-run (Monaco + diff + ⌘↵)
- backend/app/schemas/__init__.py (append)
- backend/app/api/v1/execute.py (new)
- backend/app/api/v1/router.py (patch)
- frontend/package.json (patch — `@monaco-editor/react`)
- frontend/src/features/execute/api.ts (new)
- frontend/src/features/execute/components/MonacoEditor.tsx (new)
- frontend/src/features/execute/components/MonacoDiff.tsx (new)
- frontend/src/features/inspector/store.ts (patch)
- frontend/src/features/inspector/components/SqlPanel.tsx (rewrite)
- frontend/src/features/inspector/components/PythonPanel.tsx (rewrite)

## Batch 22 — Templates
- backend/app/db/models.py (append `Template`)
- backend/app/db/session.py (append seeder)
- backend/app/schemas/__init__.py (append)
- backend/app/api/v1/templates.py (new)
- backend/app/api/v1/router.py (patch)
- frontend/src/features/templates/api.ts (new)
- frontend/src/features/templates/components/TemplateCard.tsx (new)
- frontend/src/features/templates/components/TemplateEditor.tsx (new)
- frontend/src/features/templates/pages/TemplatesPage.tsx (new)

## Batch 21 — Auth (JWT + password reset)
- backend/requirements.txt (append `pyjwt`, `bcrypt`)
- backend/app/db/models.py (append `User`, `PasswordResetToken`)
- backend/app/db/session.py (patch — migrations + anonymous user)
- backend/app/core/security.py (new)
- backend/app/core/crypto.py (new)
- backend/app/schemas/__init__.py (append)
- backend/app/dependencies/__init__.py (new)
- backend/app/dependencies/auth.py (new)
- backend/app/api/v1/auth.py (new)
- backend/app/api/v1/router.py (patch)
- frontend/src/features/auth/api.ts (new)
- frontend/src/features/auth/store.ts (new)
- frontend/src/features/auth/components/ProtectedRoute.tsx (new)
- frontend/src/features/auth/components/UserMenu.tsx (new)
- frontend/src/features/auth/pages/LoginPage.tsx (new)

## Batch 20 — KPI cards + sparkline
- backend/app/agents/kpi.py (new)
- backend/app/agents/__init__.py (patch)
- backend/app/services/orchestrator.py (patch)
- frontend/src/features/chat/types.ts (append)
- frontend/src/features/charts/components/Sparkline.tsx (new)
- frontend/src/features/charts/components/KPICards.tsx (new)

## Batch 19 — Export (CSV / JSON / PNG / .sql / .py)
- frontend/src/shared/utils/export.ts (new)
- frontend/src/features/charts/components/ChartRenderer.tsx (patch)
- frontend/src/features/history/pages/RunDetailPage.tsx (patch)
- backend/app/api/v1/runs.py (patch — `/export.csv`, `/export.json`)

## Batch 18 — History page + `/runs` API
- backend/app/db/models.py (patch — `source_ids`, JSON answer)
- backend/app/services/orchestrator.py (patch)
- backend/app/api/v1/chat.py (patch)
- backend/app/api/v1/runs.py (new)
- backend/app/api/v1/router.py (patch)
- frontend/src/features/history/api.ts (new)
- frontend/src/features/history/pages/HistoryPage.tsx (new)
- frontend/src/features/history/pages/RunDetailPage.tsx (new)

## Batch 17 — Database connectors (Postgres / MySQL / SQLite)
- backend/requirements.txt (append `cryptography`)
- backend/app/core/crypto.py (new)
- backend/app/db/models.py (append `DataSource`)
- backend/app/schemas/__init__.py (append)
- backend/app/services/connector_service.py (new)
- backend/app/api/v1/sources.py (new)
- backend/app/api/v1/router.py (patch)
- frontend/src/features/sources/api.ts (new)
- frontend/src/features/sources/components/ConnectionWizard.tsx (new)
- frontend/src/features/sources/components/SourceCard.tsx (new)
- frontend/src/features/sources/components/SourcePicker.tsx (new)

## Batch 15 — Dynamic suggestion chips
- backend/app/services/suggestion_service.py (new)
- backend/app/api/v1/suggestions.py (new)
- backend/app/api/v1/router.py (patch)
- frontend/src/features/suggestions/api.ts (new)
- frontend/src/features/chat/pages/HomePage.tsx (rewrite)

## Batch 14 — Charts + final polish
- frontend/src/features/charts/components/ChartRenderer.tsx (new)
- frontend/src/features/chat/components/AnswerStream.tsx (patch)
- frontend/src/features/chat/components/AgentRail.tsx (patch)
- frontend/src/features/chat/pages/WorkspacePage.tsx (patch)
- README.md (rewrite)

## Batch 13 — Inspector panel
- frontend/src/features/inspector/store.ts (new)
- frontend/src/features/inspector/components/Inspector.tsx (new)
- frontend/src/features/inspector/components/SqlPanel.tsx (new)
- frontend/src/features/inspector/components/PythonPanel.tsx (new)
- frontend/src/features/inspector/components/TracePanel.tsx (new)
- frontend/src/features/inspector/components/AssumptionsPanel.tsx (new)
- frontend/src/features/inspector/components/InspectorToggle.tsx (new)

## Batch 12 — Datasets page + DatasetPicker
- frontend/src/features/datasets/api.ts (new)
- frontend/src/features/datasets/components/UploadDropzone.tsx (new)
- frontend/src/features/datasets/components/DatasetCard.tsx (new)
- frontend/src/features/datasets/pages/DataSourcesPage.tsx (new)
- frontend/src/features/datasets/components/DatasetPicker.tsx (new)

## Batch 11 — Chat components (Composer, AgentRail, AnswerStream)
- frontend/src/features/chat/components/Composer.tsx (new)
- frontend/src/features/chat/components/AgentRail.tsx (new)
- frontend/src/features/chat/components/AnswerStream.tsx (new)
- frontend/src/features/chat/pages/WorkspacePage.tsx (rewrite)

## Batch 10 — Chat pages + SSE hook
- frontend/src/features/chat/types.ts (new)
- frontend/src/features/chat/api.ts (new)
- frontend/src/features/chat/hooks.ts (new)
- frontend/src/features/chat/pages/HomePage.tsx (new)
- frontend/src/features/chat/pages/WorkspacePage.tsx (new)

## Batch 9 — Layouts (rail, topbar, router)
- frontend/src/app/layouts/LeftRail.tsx (new)
- frontend/src/app/layouts/TopBar.tsx (new)
- frontend/src/app/layouts/AppShell.tsx (new)
- frontend/src/app/router.tsx (new)
- frontend/src/features/chat/pages/PlaceholderPage.tsx (new)

## Batch 8 — Frontend core
- frontend/src/vite-env.d.ts (new)
- frontend/src/config/constants.ts (new)
- frontend/src/shared/utils/cn.ts (new)
- frontend/src/lib/http.ts (new)
- frontend/src/lib/sse.ts (new)
- frontend/src/main.tsx (new)
- frontend/src/App.tsx (new)

## Batch 7 — Frontend scaffold
- frontend/package.json (new)
- frontend/vite.config.ts (new)
- frontend/tsconfig.json (new)
- frontend/index.html (new)
- frontend/.env, frontend/.env.example (new)
- frontend/src/index.css (new)

## Batch 6 — Orchestrator + API
- backend/app/services/orchestrator.py (new)
- backend/app/api/__init__.py (new)
- backend/app/api/v1/__init__.py (new)
- backend/app/api/v1/router.py (new)
- backend/app/api/v1/health.py (new)
- backend/app/api/v1/chat.py (new)
- backend/app/api/v1/datasets.py (new)
- backend/app/main.py (new)

## Batch 5 — Prompts + agents
- backend/app/core/json_utils.py (new)
- backend/app/prompts/__init__.py (new)
- backend/app/agents/__init__.py (new)
- backend/app/agents/sql_agent.py (new)
- backend/app/agents/python_agent.py (new)
- backend/app/agents/visualization.py (new)
- backend/app/agents/narrative.py (new)
- backend/app/agents/quality.py (new)

## Batch 4 — Data services (DuckDB, profiling, sandbox)
- backend/app/services/duckdb_service.py (new)
- backend/app/services/profiling_service.py (new)
- backend/app/services/sandbox_service.py (new)

## Batch 3 — LLM layer (Gemini / OpenAI / Anthropic)
- backend/app/services/llm/__init__.py (new)
- backend/app/services/llm/base.py (new)
- backend/app/services/llm/gemini.py (new)
- backend/app/services/llm/openai_compat.py (new)
- backend/app/services/llm/anthropic.py (new)
- backend/app/services/llm/factory.py (new)

## Batch 2 — DB + schemas
- backend/app/db/__init__.py (new)
- backend/app/db/session.py (new)
- backend/app/db/models.py (new)
- backend/app/schemas/__init__.py (new)

## Batch 1 — Config + logging
- .env.example (new)
- .gitignore (new)
- README.md (new)
- backend/pyproject.toml (new)
- backend/app/__init__.py (new)
- backend/app/config.py (new)
- backend/app/core/__init__.py (new)
- backend/app/core/logging.py (new)

---

## Unlogged (present in code, not previously changelogged)
- `backend/app/api/v1/news.py` + `frontend/src/features/landing/components/NewsSection.tsx` — public landing-page news feed
- `frontend/src/features/templates/components/TemplateSuggestions.tsx`
- `frontend/src/shared/utils/time.ts`
- `backend/scripts/audit.ps1`

## Pending (not yet shipped)
- 16 — Provider fallback chain
- 37 — Chart type override
- 42 — PII detection + column masking
- 46 — Conversation threads in History
- 53 — Webhooks
- Multi-modal input (paste a chart image)