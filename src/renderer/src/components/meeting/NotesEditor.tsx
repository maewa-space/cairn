import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Typography from '@tiptap/extension-typography';
import { useEffect, useRef } from 'react';

interface NotesEditorProps {
  initialMarkdown: string;
  onChange: (html: string) => void;
  placeholder?: string;
}

export function NotesEditor({ initialMarkdown, onChange, placeholder }: NotesEditorProps) {
  const lastEmitted = useRef('');
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Placeholder.configure({
        placeholder: placeholder ?? 'Type rough notes here while you listen…',
      }),
      Typography,
    ],
    content: initialMarkdown,
    editorProps: {
      attributes: {
        class:
          'editor-prose ProseMirror max-w-none focus:outline-none min-h-full px-1 py-2',
      },
    },
    onUpdate({ editor }) {
      const html = editor.getHTML();
      if (html === lastEmitted.current) return;
      lastEmitted.current = html;
      onChange(html);
    },
  });

  useEffect(() => () => editor?.destroy(), [editor]);

  return <EditorContent editor={editor} className="h-full" data-testid="notes-editor" />;
}
