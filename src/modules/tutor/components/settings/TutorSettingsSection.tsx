'use client';
import { useCallback, useState } from 'react';
import { shallow } from 'zustand/shallow';
import { useChatStore } from '@/lib/store';
import { DEFAULT_TUTOR_MODEL_ID } from '@/lib/constants';
import type { SettingsSectionProps } from '@/lib/ui/panels';
import { TutorPanel } from '@/modules/tutor/components/settings/TutorPanel';

/**
 * The tutor module's `settingsSection` slot. Owns its own form state and writes
 * straight to the store, so the drawer's shared form/autosave plumbing carries no
 * tutor fields. It still routes through `createAutoSaveSetter` for the saved toast.
 */
export function TutorSettingsSection({
  renderSection,
  createAutoSaveSetter,
}: SettingsSectionProps) {
  const { ui, setUI, chat, updateChatSettings, experimentalTutor } = useChatStore(
    (s) => ({
      ui: s.ui,
      setUI: s.setUI,
      chat: s.chats.find((c) => c.id === s.selectedChatId),
      updateChatSettings: s.updateChatSettings,
      experimentalTutor: !!s.ui.flags.experimentalTutor,
    }),
    shallow,
  );

  const [tutorDefaultModel, setTutorDefaultModel] = useState<string>(
    ui.tutor?.defaultModelId || DEFAULT_TUTOR_MODEL_ID,
  );

  const commitTutorDefaultModel = useCallback(
    (value: string) => {
      setTutorDefaultModel(value);
      setUI({ tutor: { defaultModelId: value } });
    },
    [setUI],
  );

  const onForceTutorModeChange = useCallback(
    async (enabled: boolean) => {
      setUI({ tutor: { forceMode: enabled } });
      if (enabled && chat && !chat.settings.features.tutor?.enabled) {
        await updateChatSettings({ features: { tutor: { enabled: true } } });
      }
    },
    [chat, setUI, updateChatSettings],
  );

  return (
    <TutorPanel
      renderSection={renderSection}
      experimentalTutor={experimentalTutor}
      ui={ui}
      setUI={setUI}
      onForceTutorModeChange={onForceTutorModeChange}
      tutorDefaultModel={tutorDefaultModel}
      setTutorDefaultModel={createAutoSaveSetter(commitTutorDefaultModel)}
    />
  );
}
