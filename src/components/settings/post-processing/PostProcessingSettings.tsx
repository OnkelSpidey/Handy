import React, { useEffect, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { CheckCircle2, CircleAlert, Clock, Play, RefreshCcw } from "lucide-react";
import { commands } from "@/bindings";

import { Alert } from "../../ui/Alert";
import {
  Dropdown,
  SettingContainer,
  SettingsGroup,
  Textarea,
} from "@/components/ui";
import { Button } from "../../ui/Button";
import { ResetButton } from "../../ui/ResetButton";
import { Input } from "../../ui/Input";

import { ProviderSelect } from "../PostProcessingSettingsApi/ProviderSelect";
import { BaseUrlField } from "../PostProcessingSettingsApi/BaseUrlField";
import { ApiKeyField } from "../PostProcessingSettingsApi/ApiKeyField";
import { ModelSelect } from "../PostProcessingSettingsApi/ModelSelect";
import { usePostProcessProviderState } from "../PostProcessingSettingsApi/usePostProcessProviderState";
import { ShortcutInput } from "../ShortcutInput";
import { useSettings } from "../../../hooks/useSettings";

type ReadinessState = "ready" | "warning";

interface ReadinessItem {
  label: string;
  value: string;
  state: ReadinessState;
}

const StatusDot: React.FC<{ state: ReadinessState }> = ({ state }) => {
  const Icon = state === "ready" ? CheckCircle2 : CircleAlert;
  const color = state === "ready" ? "text-green-500" : "text-yellow-500";

  return <Icon className={`h-4 w-4 shrink-0 ${color}`} />;
};

const isLocalBaseUrl = (baseUrl: string) =>
  baseUrl.startsWith("http://localhost") ||
  baseUrl.startsWith("http://127.0.0.1");

const PostProcessingCockpitComponent: React.FC = () => {
  const { t } = useTranslation();
  const { getSetting } = useSettings();
  const [testStatus, setTestStatus] = useState<"idle" | "running" | "ok" | "error">(
    "idle",
  );
  const [testMessage, setTestMessage] = useState("");

  const enabled = getSetting("post_process_enabled") ?? false;
  const providerId = getSetting("post_process_provider_id") || "";
  const providers = getSetting("post_process_providers") || [];
  const provider = providers.find((item) => item.id === providerId) || null;
  const models = getSetting("post_process_models") || {};
  const model = provider ? (models[provider.id] || "").trim() : "";
  const apiKeys = getSetting("post_process_api_keys") || {};
  const apiKey = provider ? (apiKeys[provider.id] || "").trim() : "";
  const prompts = getSetting("post_process_prompts") || [];
  const selectedPromptId = getSetting("post_process_selected_prompt_id") || "";
  const selectedPrompt =
    prompts.find((prompt) => prompt.id === selectedPromptId) || null;
  const customWords = getSetting("custom_words") || [];
  const apiKeyRequired =
    !!provider &&
    provider.id !== "custom" &&
    provider.id !== "apple_intelligence" &&
    !isLocalBaseUrl(provider.base_url);

  const readiness: ReadinessItem[] = [
    {
      label: t("settings.postProcessing.cockpit.items.enabled"),
      value: enabled
        ? t("settings.postProcessing.cockpit.values.enabled")
        : t("settings.postProcessing.cockpit.values.disabled"),
      state: enabled ? "ready" : "warning",
    },
    {
      label: t("settings.postProcessing.cockpit.items.provider"),
      value:
        provider?.label || t("settings.postProcessing.cockpit.values.missing"),
      state: provider ? "ready" : "warning",
    },
    {
      label: t("settings.postProcessing.cockpit.items.model"),
      value: model || t("settings.postProcessing.cockpit.values.missing"),
      state: model ? "ready" : "warning",
    },
    {
      label: t("settings.postProcessing.cockpit.items.apiKey"),
      value: apiKeyRequired
        ? apiKey
          ? t("settings.postProcessing.cockpit.values.saved")
          : t("settings.postProcessing.cockpit.values.missing")
        : t("settings.postProcessing.cockpit.values.notRequired"),
      state: !apiKeyRequired || apiKey ? "ready" : "warning",
    },
    {
      label: t("settings.postProcessing.cockpit.items.prompt"),
      value:
        selectedPrompt?.name ||
        t("settings.postProcessing.cockpit.values.missing"),
      state: selectedPrompt?.prompt.trim() ? "ready" : "warning",
    },
    {
      label: t("settings.postProcessing.cockpit.items.protectedTerms"),
      value: t("settings.postProcessing.cockpit.values.protectedTerms", {
        count: customWords.length,
      }),
      state: "ready",
    },
  ];

  const readyCount = readiness.filter((item) => item.state === "ready").length;
  const isReady = readyCount === readiness.length;

  const handleConnectionTest = async () => {
    setTestStatus("running");
    setTestMessage("");
    const startedAt = performance.now();

    try {
      const result = await commands.previewPostProcessTranscript(
        t("settings.postProcessing.cockpit.testTranscript"),
      );
      const elapsedMs = Math.round(performance.now() - startedAt);

      if (result.status === "ok") {
        setTestStatus("ok");
        setTestMessage(
          t("settings.postProcessing.cockpit.testOk", {
            ms: elapsedMs,
          }),
        );
      } else {
        setTestStatus("error");
        setTestMessage(result.error);
      }
    } catch (err) {
      setTestStatus("error");
      setTestMessage(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <SettingContainer
      title={t("settings.postProcessing.cockpit.title")}
      description={t("settings.postProcessing.cockpit.description")}
      descriptionMode="tooltip"
      layout="stacked"
      grouped={true}
    >
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3 rounded-md border border-mid-gray/20 bg-mid-gray/5 px-3 py-2">
          <div className="flex items-center gap-2 text-sm">
            <StatusDot state={isReady ? "ready" : "warning"} />
            <span className="font-semibold">
              {isReady
                ? t("settings.postProcessing.cockpit.ready")
                : t("settings.postProcessing.cockpit.needsAttention", {
                    ready: readyCount,
                    total: readiness.length,
                  })}
            </span>
          </div>
          <Button
            onClick={handleConnectionTest}
            variant="secondary"
            size="sm"
            disabled={testStatus === "running"}
            className="inline-flex items-center gap-2"
          >
            <Clock className="h-4 w-4" />
            {testStatus === "running"
              ? t("settings.postProcessing.cockpit.testing")
              : t("settings.postProcessing.cockpit.testConnection")}
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {readiness.map((item) => (
            <div
              key={item.label}
              className="flex min-h-10 items-center gap-2 rounded-md border border-mid-gray/20 px-3 py-2"
            >
              <StatusDot state={item.state} />
              <div className="min-w-0">
                <div className="text-xs text-mid-gray">{item.label}</div>
                <div className="truncate text-sm font-medium">{item.value}</div>
              </div>
            </div>
          ))}
        </div>

        {testStatus === "ok" && testMessage && (
          <Alert variant="success" contained>
            {testMessage}
          </Alert>
        )}

        {testStatus === "error" && testMessage && (
          <Alert variant="error" contained>
            {testMessage}
          </Alert>
        )}
      </div>
    </SettingContainer>
  );
};

const PostProcessingSettingsApiComponent: React.FC = () => {
  const { t } = useTranslation();
  const state = usePostProcessProviderState();

  return (
    <>
      <SettingContainer
        title={t("settings.postProcessing.api.provider.title")}
        description={t("settings.postProcessing.api.provider.description")}
        descriptionMode="tooltip"
        layout="horizontal"
        grouped={true}
      >
        <div className="flex items-center gap-2">
          <ProviderSelect
            options={state.providerOptions}
            value={state.selectedProviderId}
            onChange={state.handleProviderSelect}
          />
        </div>
      </SettingContainer>

      {state.isAppleProvider ? (
        state.appleIntelligenceUnavailable ? (
          <Alert variant="error" contained>
            {t("settings.postProcessing.api.appleIntelligence.unavailable")}
          </Alert>
        ) : null
      ) : (
        <>
          {state.selectedProvider?.id === "custom" && (
            <SettingContainer
              title={t("settings.postProcessing.api.baseUrl.title")}
              description={t("settings.postProcessing.api.baseUrl.description")}
              descriptionMode="tooltip"
              layout="horizontal"
              grouped={true}
            >
              <div className="flex items-center gap-2">
                <BaseUrlField
                  value={state.baseUrl}
                  onBlur={state.handleBaseUrlChange}
                  placeholder={t(
                    "settings.postProcessing.api.baseUrl.placeholder",
                  )}
                  disabled={state.isBaseUrlUpdating}
                  className="min-w-[380px]"
                />
              </div>
            </SettingContainer>
          )}

          <SettingContainer
            title={t("settings.postProcessing.api.apiKey.title")}
            description={t("settings.postProcessing.api.apiKey.description")}
            descriptionMode="tooltip"
            layout="horizontal"
            grouped={true}
          >
            <div className="flex items-center gap-2">
              <ApiKeyField
                value={state.apiKey}
                onBlur={state.handleApiKeyChange}
                placeholder={t(
                  "settings.postProcessing.api.apiKey.placeholder",
                )}
                disabled={state.isApiKeyUpdating}
                className="min-w-[320px]"
              />
            </div>
          </SettingContainer>
        </>
      )}

      {!state.isAppleProvider && (
        <SettingContainer
          title={t("settings.postProcessing.api.model.title")}
          description={
            state.isCustomProvider
              ? t("settings.postProcessing.api.model.descriptionCustom")
              : t("settings.postProcessing.api.model.descriptionDefault")
          }
          descriptionMode="tooltip"
          layout="stacked"
          grouped={true}
        >
          <div className="flex items-center gap-2">
            <ModelSelect
              value={state.model}
              options={state.modelOptions}
              disabled={state.isModelUpdating}
              isLoading={state.isFetchingModels}
              placeholder={
                state.modelOptions.length > 0
                  ? t(
                      "settings.postProcessing.api.model.placeholderWithOptions",
                    )
                  : t("settings.postProcessing.api.model.placeholderNoOptions")
              }
              onSelect={state.handleModelSelect}
              onCreate={state.handleModelCreate}
              onBlur={() => {}}
              className="flex-1 min-w-[380px]"
            />
            <ResetButton
              onClick={state.handleRefreshModels}
              disabled={state.isFetchingModels}
              ariaLabel={t("settings.postProcessing.api.model.refreshModels")}
              className="flex h-10 w-10 items-center justify-center"
            >
              <RefreshCcw
                className={`h-4 w-4 ${state.isFetchingModels ? "animate-spin" : ""}`}
              />
            </ResetButton>
          </div>
        </SettingContainer>
      )}
    </>
  );
};

const PostProcessingSettingsPromptsComponent: React.FC = () => {
  const { t } = useTranslation();
  const { getSetting, updateSetting, isUpdating, refreshSettings } =
    useSettings();
  const [isCreating, setIsCreating] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftText, setDraftText] = useState("");

  const prompts = getSetting("post_process_prompts") || [];
  const selectedPromptId = getSetting("post_process_selected_prompt_id") || "";
  const selectedPrompt =
    prompts.find((prompt) => prompt.id === selectedPromptId) || null;

  useEffect(() => {
    if (isCreating) return;

    if (selectedPrompt) {
      setDraftName(selectedPrompt.name);
      setDraftText(selectedPrompt.prompt);
    } else {
      setDraftName("");
      setDraftText("");
    }
  }, [
    isCreating,
    selectedPromptId,
    selectedPrompt?.name,
    selectedPrompt?.prompt,
  ]);

  const handlePromptSelect = (promptId: string | null) => {
    if (!promptId) return;
    updateSetting("post_process_selected_prompt_id", promptId);
    setIsCreating(false);
  };

  const handleCreatePrompt = async () => {
    if (!draftName.trim() || !draftText.trim()) return;

    try {
      const result = await commands.addPostProcessPrompt(
        draftName.trim(),
        draftText.trim(),
      );
      if (result.status === "ok") {
        await refreshSettings();
        updateSetting("post_process_selected_prompt_id", result.data.id);
        setIsCreating(false);
      }
    } catch (error) {
      console.error("Failed to create prompt:", error);
    }
  };

  const handleUpdatePrompt = async () => {
    if (!selectedPromptId || !draftName.trim() || !draftText.trim()) return;

    try {
      await commands.updatePostProcessPrompt(
        selectedPromptId,
        draftName.trim(),
        draftText.trim(),
      );
      await refreshSettings();
    } catch (error) {
      console.error("Failed to update prompt:", error);
    }
  };

  const handleDeletePrompt = async (promptId: string) => {
    if (!promptId) return;

    try {
      await commands.deletePostProcessPrompt(promptId);
      await refreshSettings();
      setIsCreating(false);
    } catch (error) {
      console.error("Failed to delete prompt:", error);
    }
  };

  const handleCancelCreate = () => {
    setIsCreating(false);
    if (selectedPrompt) {
      setDraftName(selectedPrompt.name);
      setDraftText(selectedPrompt.prompt);
    } else {
      setDraftName("");
      setDraftText("");
    }
  };

  const handleStartCreate = () => {
    setIsCreating(true);
    setDraftName("");
    setDraftText("");
  };

  const hasPrompts = prompts.length > 0;
  const isDirty =
    !!selectedPrompt &&
    (draftName.trim() !== selectedPrompt.name ||
      draftText.trim() !== selectedPrompt.prompt.trim());

  return (
    <SettingContainer
      title={t("settings.postProcessing.prompts.selectedPrompt.title")}
      description={t(
        "settings.postProcessing.prompts.selectedPrompt.description",
      )}
      descriptionMode="tooltip"
      layout="stacked"
      grouped={true}
    >
      <div className="space-y-3">
        <div className="flex gap-2">
          <Dropdown
            selectedValue={selectedPromptId || null}
            options={prompts.map((p) => ({
              value: p.id,
              label: p.name,
            }))}
            onSelect={(value) => handlePromptSelect(value)}
            placeholder={
              prompts.length === 0
                ? t("settings.postProcessing.prompts.noPrompts")
                : t("settings.postProcessing.prompts.selectPrompt")
            }
            disabled={
              isUpdating("post_process_selected_prompt_id") || isCreating
            }
            className="flex-1"
          />
          <Button
            onClick={handleStartCreate}
            variant="primary"
            size="md"
            disabled={isCreating}
          >
            {t("settings.postProcessing.prompts.createNew")}
          </Button>
        </div>

        {!isCreating && hasPrompts && selectedPrompt && (
          <div className="space-y-3">
            <div className="space-y-2 flex flex-col">
              <label className="text-sm font-semibold">
                {t("settings.postProcessing.prompts.promptLabel")}
              </label>
              <Input
                type="text"
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                placeholder={t(
                  "settings.postProcessing.prompts.promptLabelPlaceholder",
                )}
                variant="compact"
              />
            </div>

            <div className="space-y-2 flex flex-col">
              <label className="text-sm font-semibold">
                {t("settings.postProcessing.prompts.promptInstructions")}
              </label>
              <Textarea
                value={draftText}
                onChange={(e) => setDraftText(e.target.value)}
                placeholder={t(
                  "settings.postProcessing.prompts.promptInstructionsPlaceholder",
                )}
              />
              <p className="text-xs text-mid-gray/70">
                <Trans
                  i18nKey="settings.postProcessing.prompts.promptTip"
                  components={{ code: <code /> }}
                />
              </p>
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                onClick={handleUpdatePrompt}
                variant="primary"
                size="md"
                disabled={!draftName.trim() || !draftText.trim() || !isDirty}
              >
                {t("settings.postProcessing.prompts.updatePrompt")}
              </Button>
              <Button
                onClick={() => handleDeletePrompt(selectedPromptId)}
                variant="secondary"
                size="md"
                disabled={!selectedPromptId || prompts.length <= 1}
              >
                {t("settings.postProcessing.prompts.deletePrompt")}
              </Button>
            </div>
          </div>
        )}

        {!isCreating && !selectedPrompt && (
          <div className="p-3 bg-mid-gray/5 rounded-md border border-mid-gray/20">
            <p className="text-sm text-mid-gray">
              {hasPrompts
                ? t("settings.postProcessing.prompts.selectToEdit")
                : t("settings.postProcessing.prompts.createFirst")}
            </p>
          </div>
        )}

        {isCreating && (
          <div className="space-y-3">
            <div className="space-y-2 block flex flex-col">
              <label className="text-sm font-semibold text-text">
                {t("settings.postProcessing.prompts.promptLabel")}
              </label>
              <Input
                type="text"
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                placeholder={t(
                  "settings.postProcessing.prompts.promptLabelPlaceholder",
                )}
                variant="compact"
              />
            </div>

            <div className="space-y-2 flex flex-col">
              <label className="text-sm font-semibold">
                {t("settings.postProcessing.prompts.promptInstructions")}
              </label>
              <Textarea
                value={draftText}
                onChange={(e) => setDraftText(e.target.value)}
                placeholder={t(
                  "settings.postProcessing.prompts.promptInstructionsPlaceholder",
                )}
              />
              <p className="text-xs text-mid-gray/70">
                <Trans
                  i18nKey="settings.postProcessing.prompts.promptTip"
                  components={{ code: <code /> }}
                />
              </p>
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                onClick={handleCreatePrompt}
                variant="primary"
                size="md"
                disabled={!draftName.trim() || !draftText.trim()}
              >
                {t("settings.postProcessing.prompts.createPrompt")}
              </Button>
              <Button
                onClick={handleCancelCreate}
                variant="secondary"
                size="md"
              >
                {t("settings.postProcessing.prompts.cancel")}
              </Button>
            </div>
          </div>
        )}
      </div>
    </SettingContainer>
  );
};

const PostProcessingSettingsTestComponent: React.FC = () => {
  const { t } = useTranslation();
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [error, setError] = useState("");
  const [isRunning, setIsRunning] = useState(false);

  const handleRunTest = async () => {
    setError("");
    setIsRunning(true);

    try {
      const result = await commands.previewPostProcessTranscript(input);
      if (result.status === "ok") {
        setOutput(result.data);
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <SettingContainer
      title={t("settings.postProcessing.test.title")}
      description={t("settings.postProcessing.test.description")}
      descriptionMode="tooltip"
      layout="stacked"
      grouped={true}
    >
      <div className="space-y-3">
        <div className="space-y-2 flex flex-col">
          <label className="text-sm font-semibold">
            {t("settings.postProcessing.test.inputLabel")}
          </label>
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t("settings.postProcessing.test.inputPlaceholder")}
            className="min-h-[120px]"
          />
        </div>

        <div className="flex justify-end">
          <Button
            onClick={handleRunTest}
            variant="primary"
            size="md"
            disabled={isRunning}
            className="inline-flex items-center gap-2"
          >
            <Play className="h-4 w-4" />
            {isRunning
              ? t("settings.postProcessing.test.running")
              : t("settings.postProcessing.test.run")}
          </Button>
        </div>

        {error && (
          <Alert variant="error" contained>
            {error}
          </Alert>
        )}

        <div className="space-y-2 flex flex-col">
          <label className="text-sm font-semibold">
            {t("settings.postProcessing.test.outputLabel")}
          </label>
          <Textarea
            value={output}
            readOnly
            placeholder={t("settings.postProcessing.test.outputPlaceholder")}
            className="min-h-[120px]"
          />
        </div>
      </div>
    </SettingContainer>
  );
};

export const PostProcessingSettingsApi = React.memo(
  PostProcessingSettingsApiComponent,
);
PostProcessingSettingsApi.displayName = "PostProcessingSettingsApi";

export const PostProcessingSettingsPrompts = React.memo(
  PostProcessingSettingsPromptsComponent,
);
PostProcessingSettingsPrompts.displayName = "PostProcessingSettingsPrompts";

export const PostProcessingSettings: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div className="max-w-3xl w-full mx-auto space-y-6">
      <SettingsGroup title={t("settings.postProcessing.hotkey.title")}>
        <ShortcutInput
          shortcutId="transcribe_with_post_process"
          descriptionMode="tooltip"
          grouped={true}
        />
      </SettingsGroup>

      <SettingsGroup title={t("settings.postProcessing.cockpit.groupTitle")}>
        <PostProcessingCockpitComponent />
      </SettingsGroup>

      <SettingsGroup title={t("settings.postProcessing.api.title")}>
        <PostProcessingSettingsApi />
      </SettingsGroup>

      <SettingsGroup title={t("settings.postProcessing.prompts.title")}>
        <PostProcessingSettingsPrompts />
      </SettingsGroup>

      <SettingsGroup title={t("settings.postProcessing.test.groupTitle")}>
        <PostProcessingSettingsTestComponent />
      </SettingsGroup>
    </div>
  );
};
