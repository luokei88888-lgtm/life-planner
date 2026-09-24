import { useEffect } from "react";

const SKIP_TYPES = new Set(["hidden", "checkbox", "radio", "range", "file", "button", "submit", "reset"]);

function silence(node: Element) {
  if (node instanceof HTMLFormElement) {
    node.setAttribute("autocomplete", "off");
    return;
  }
  if (!(node instanceof HTMLInputElement) && !(node instanceof HTMLTextAreaElement)) return;
  if (node instanceof HTMLInputElement && SKIP_TYPES.has(node.type)) return;
  node.setAttribute("autocomplete", "off");
  node.setAttribute("autocorrect", "off");
  node.setAttribute("autocapitalize", "none");
  node.setAttribute("data-1p-ignore", "true");
  node.setAttribute("data-lpignore", "true");
}

function scan(root: ParentNode) {
  root.querySelectorAll("input, textarea, form").forEach(silence);
}

export function PlainFields() {
  useEffect(() => {
    scan(document);
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        for (const added of record.addedNodes) {
          if (!(added instanceof Element)) continue;
          silence(added);
          scan(added);
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);
  return null;
}
