"use client";
import { useChatStore } from "@/lib/store";
import { useState } from "react";

export default function SettingsDrawer() {
  const { chats, selectedChatId, updateChatSettings, setUI, loadModels } = useChatStore();
  const chat = chats.find((c) => c.id === selectedChatId)!;
  const [system, setSystem] = useState(chat.settings.system ?? "");
  const [temperature, setTemperature] = useState<number | undefined>(chat.settings.temperature);
  const [top_p, setTopP] = useState<number | undefined>(chat.settings.top_p);
  const [max_tokens, setMaxTokens] = useState<number | undefined>(chat.settings.max_tokens);
  const [customModel, setCustomModel] = useState("");

  return (
    <div className="fixed inset-y-0 right-0 w-full sm:w-[420px] bg-surface border-l border-border p-4 space-y-3 shadow-[var(--shadow-card)]">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Chat Settings</h3>
        <button className="btn btn-ghost" onClick={() => setUI({ showSettings: false })}>Close</button>
      </div>
      <div className="space-y-2">
        <label className="text-sm">System prompt</label>
        <textarea className="input w-full h-32" value={system} onChange={(e) => setSystem(e.target.value)} />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1">
          <label className="text-sm flex items-center justify-between">
            <span>Temperature</span>
            <button className="btn btn-ghost text-xs" onClick={() => setTemperature(undefined)}>Use default</button>
          </label>
          <input
            className="input w-full"
            type="number"
            step="0.1"
            min="0"
            max="2"
            value={temperature ?? ""}
            placeholder="model default"
            onChange={(e) => setTemperature(e.target.value === "" ? undefined : parseFloat(e.target.value))}
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm flex items-center justify-between">
            <span>Top_p</span>
            <button className="btn btn-ghost text-xs" onClick={() => setTopP(undefined)}>Use default</button>
          </label>
          <input
            className="input w-full"
            type="number"
            step="0.05"
            min="0"
            max="1"
            value={top_p ?? ""}
            placeholder="model default"
            onChange={(e) => setTopP(e.target.value === "" ? undefined : parseFloat(e.target.value))}
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm flex items-center justify-between">
            <span>Max tokens</span>
            <button className="btn btn-ghost text-xs" onClick={() => setMaxTokens(undefined)}>Auto</button>
          </label>
          <input
            className="input w-full"
            type="number"
            step="1"
            min="1"
            value={max_tokens ?? ""}
            placeholder="auto"
            onChange={(e) => setMaxTokens(e.target.value === "" ? undefined : parseInt(e.target.value))}
          />
        </div>
      </div>
      <div className="space-y-2 pt-2">
        <label className="text-sm">Add custom model ID</label>
        <div className="flex gap-2">
          <input className="input flex-1" placeholder="provider/model-id" value={customModel} onChange={(e) => setCustomModel(e.target.value)} />
          <button className="btn btn-outline" onClick={() => { if (customModel.trim()) { updateChatSettings({ model: customModel.trim() }); setCustomModel(""); } }}>Add</button>
        </div>
        <div>
          <button className="btn btn-ghost" onClick={() => loadModels()}>Refresh model list</button>
        </div>
      </div>
      <div className="pt-2">
        <button
          className="btn"
          onClick={() => {
            updateChatSettings({ system, temperature, top_p, max_tokens });
            setUI({ showSettings: false });
          }}
        >
          Save
        </button>
      </div>
    </div>
  );
}


