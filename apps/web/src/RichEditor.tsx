import { useRef } from "react";

export function RichEditor({ onChange }: { onChange: (text: string, html: string) => void }) {
  const editor = useRef<HTMLDivElement>(null);
  const selection = useRef<Range | null>(null);
  function remember() {
    const current = window.getSelection();
    if (current?.rangeCount && editor.current?.contains(current.anchorNode)) selection.current = current.getRangeAt(0).cloneRange();
  }
  function emit() {
    if (editor.current) onChange(editor.current.innerText, editor.current.innerHTML);
    remember();
  }
  function command(name: string, value?: string) {
    if (selection.current) {
      const current = window.getSelection();
      current?.removeAllRanges();
      current?.addRange(selection.current);
    }
    editor.current?.focus();
    document.execCommand(name, false, value);
    emit();
  }
  const button = (label: string, title: string, cmd: string, value?: string) => (
    <button type="button" title={title} aria-label={title} onPointerDown={event => { remember(); event.preventDefault(); }} onClick={() => command(cmd, value)}>{label}</button>
  );
  return <div className="editor-shell" onClick={event => { if (event.target === event.currentTarget) editor.current?.focus(); }}>
    <div ref={editor} className="rich-editor" role="textbox" aria-label="Email body" aria-multiline="true"
      contentEditable suppressContentEditableWarning data-placeholder="Type Your Reply..."
      onInput={emit} onKeyUp={remember} onMouseUp={remember} />
    <div className="editor-toolbar" role="toolbar" aria-label="Formatting toolbar">
      {button("↶", "Undo", "undo")}{button("↷", "Redo", "redo")}<span />
      <select aria-label="Text size" defaultValue="3" onChange={event => command("fontSize", event.target.value)}>
        <option value="2">Small</option><option value="3">Tt</option><option value="4">Large</option><option value="5">Heading</option>
      </select><span />
      {button("B", "Bold", "bold")}{button("𝐼", "Italic", "italic")}{button("U̲", "Underline", "underline")}<span />
      <select aria-label="Text alignment" defaultValue="justifyLeft" onChange={event => command(event.target.value)}>
        <option value="justifyLeft">≡</option><option value="justifyCenter">Center</option><option value="justifyRight">Right</option>
      </select><span />
      {button("1≡", "Numbered list", "insertOrderedList")}{button("☷", "Bullet list", "insertUnorderedList")}
      {button("⇥", "Indent", "indent")}{button("⇤", "Outdent", "outdent")}{button("❝", "Quote", "formatBlock", "blockquote")}<span />
      {button("S̶", "Strikethrough", "strikeThrough")}
    </div>
  </div>;
}
