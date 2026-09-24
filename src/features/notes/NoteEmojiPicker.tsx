import { useEffect, useState } from "react";
import { EMOJI_CATEGORIES, type EmojiCategoryId } from "./emojiCatalog";

export function NoteEmojiPicker({
  open,
  onOpenChange,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (emoji: string) => void;
}) {
  const [tab, setTab] = useState<EmojiCategoryId>("face");
  const current = EMOJI_CATEGORIES.find((item) => item.id === tab) ?? EMOJI_CATEGORIES[0];

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.stopImmediatePropagation();
      onOpenChange(false);
    }
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, onOpenChange]);

  return (
    <div className="emoji-picker">
      <button
        type="button"
        className={`emoji-toggle ${open ? "on" : ""}`}
        aria-expanded={open}
        aria-label="插入表情"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => onOpenChange(!open)}
      >
        😊
      </button>
      {open ? (
        <div className="emoji-panel" role="listbox" aria-label="表情">
          <div className="emoji-tabs">
            {EMOJI_CATEGORIES.map((item) => (
              <button
                key={item.id}
                type="button"
                className={item.id === current.id ? "on" : ""}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => setTab(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="emoji-grid">
            {current.emojis.map((emoji, index) => (
              <button
                key={`${current.id}-${index}`}
                type="button"
                aria-label={emoji}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => onPick(emoji)}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
