import React from "react";
import { useTranslation } from "react-i18next";
import { ToggleSwitch } from "../ui/ToggleSwitch";
import { useSettings } from "../../hooks/useSettings";

interface DoubleTapLockProps {
  descriptionMode?: "inline" | "tooltip";
  grouped?: boolean;
}

export const DoubleTapLock: React.FC<DoubleTapLockProps> = React.memo(
  ({ descriptionMode = "tooltip", grouped = false }) => {
    const { t } = useTranslation();
    const { getSetting, updateSetting, isUpdating } = useSettings();

    const pushToTalkEnabled = getSetting("push_to_talk") || false;
    const doubleTapLockEnabled = getSetting("double_tap_lock") || false;

    return (
      <ToggleSwitch
        checked={doubleTapLockEnabled}
        onChange={(enabled) => updateSetting("double_tap_lock", enabled)}
        disabled={!pushToTalkEnabled}
        isUpdating={isUpdating("double_tap_lock")}
        label={t("settings.general.doubleTapLock.label")}
        description={t("settings.general.doubleTapLock.description")}
        descriptionMode={descriptionMode}
        grouped={grouped}
      />
    );
  },
);
