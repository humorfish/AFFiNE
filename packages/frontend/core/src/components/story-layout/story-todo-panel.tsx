import { useCallback, useEffect, useRef, useState } from 'react';

interface TodoItem {
  id: string;
  text: string;
  done: boolean;
  createdAt: string;
}

interface StoryTodoPanelProps {
  open: boolean;
  onClose: () => void;
  anchorEl: HTMLElement | null;
  todos: TodoItem[];
  onAddTodo: (text: string) => void;
  onToggleTodo: (id: string) => void;
  onDeleteTodo: (id: string) => void;
}

export const StoryTodoPanel = ({
  open,
  onClose,
  anchorEl,
  todos,
  onAddTodo,
  onToggleTodo,
  onDeleteTodo,
}: StoryTodoPanelProps) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const [inputValue, setInputValue] = useState('');
  const [position, setPosition] = useState({ top: 0, left: 0 });

  const pendingTodos = todos.filter(todo => !todo.done);
  const doneTodos = todos.filter(todo => todo.done);

  useEffect(() => {
    if (open && anchorEl) {
      const rect = anchorEl.getBoundingClientRect();
      setPosition({ top: rect.bottom + 4, left: rect.left });
    }
  }, [open, anchorEl]);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(event.target as Node)
      ) {
        onClose();
      }
    };
    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscapeKey);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscapeKey);
    };
  }, [open, onClose]);

  const handleAddTodo = useCallback(() => {
    if (inputValue.trim()) {
      onAddTodo(inputValue.trim());
      setInputValue('');
    }
  }, [inputValue, onAddTodo]);

  if (!open) return null;

  return (
    <div
      ref={panelRef}
      style={{ ...styles.panel, top: position.top, left: position.left }}
    >
      <div style={styles.header}>
        <span style={styles.title}>📋 待办事项</span>
        {pendingTodos.length > 0 && (
          <span style={styles.badge}>{pendingTodos.length}</span>
        )}
      </div>

      <div style={styles.inputRow}>
        <input
          type="text"
          placeholder="快速记录..."
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') handleAddTodo();
          }}
          style={styles.input}
          autoFocus
        />
        <button onClick={handleAddTodo} style={styles.addButton}>
          添加
        </button>
      </div>

      {pendingTodos.map(todo => (
        <div key={todo.id} style={styles.todoItem}>
          <input
            type="checkbox"
            checked={false}
            onChange={() => onToggleTodo(todo.id)}
            style={styles.checkbox}
          />
          <span style={{ flex: 1, fontSize: 14 }}>{todo.text}</span>
          <button
            onClick={() => onDeleteTodo(todo.id)}
            style={styles.deleteButton}
          >
            ×
          </button>
        </div>
      ))}

      {doneTodos.length > 0 && (
        <>
          <div style={styles.separator}>已完成 ({doneTodos.length})</div>
          {doneTodos.map(todo => (
            <div key={todo.id} style={styles.todoItem}>
              <input
                type="checkbox"
                checked
                onChange={() => onToggleTodo(todo.id)}
                style={styles.checkbox}
              />
              <span
                style={{
                  flex: 1,
                  fontSize: 14,
                  textDecoration: 'line-through',
                  opacity: 0.5,
                }}
              >
                {todo.text}
              </span>
              <button
                onClick={() => onDeleteTodo(todo.id)}
                style={styles.deleteButton}
              >
                ×
              </button>
            </div>
          ))}
        </>
      )}

      {todos.length === 0 && <div style={styles.empty}>还没有待办事项</div>}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  panel: {
    position: 'fixed',
    zIndex: 100,
    width: 320,
    maxHeight: 400,
    background: 'var(--affine-background-secondary-color, #16162a)',
    border: '1px solid var(--affine-border-color)',
    borderRadius: 8,
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    padding: '12px 16px',
    borderBottom: '1px solid var(--affine-border-color)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 14,
    fontWeight: 600,
    color: 'var(--affine-text-primary-color)',
  },
  badge: {
    background: 'var(--affine-primary-color, #6c5ce7)',
    color: '#fff',
    padding: '2px 8px',
    borderRadius: 12,
    fontSize: 12,
    minWidth: 20,
    textAlign: 'center',
  },
  inputRow: {
    padding: '8px 12px',
    display: 'flex',
    gap: 8,
  },
  input: {
    flex: 1,
    padding: '6px 10px',
    background: 'var(--affine-background-primary-color)',
    border: '1px solid var(--affine-border-color)',
    borderRadius: 6,
    color: 'var(--affine-text-primary-color)',
    fontSize: 13,
    outline: 'none',
  },
  addButton: {
    padding: '6px 14px',
    background: 'var(--affine-primary-color, #6c5ce7)',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    fontSize: 13,
    cursor: 'pointer',
  },
  todoItem: {
    padding: '8px 16px',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    color: 'var(--affine-text-primary-color)',
  },
  checkbox: {
    width: 16,
    height: 16,
    cursor: 'pointer',
    flexShrink: 0,
  },
  deleteButton: {
    padding: '2px 6px',
    background: 'transparent',
    border: 'none',
    color: 'var(--affine-text-secondary-color)',
    cursor: 'pointer',
    fontSize: 14,
    lineHeight: 1,
  },
  separator: {
    padding: '8px 16px',
    fontSize: 12,
    color: 'var(--affine-text-secondary-color)',
    fontWeight: 500,
    borderTop: '1px solid var(--affine-border-color)',
  },
  empty: {
    padding: '24px 16px',
    textAlign: 'center',
    color: 'var(--affine-text-secondary-color)',
    fontSize: 14,
  },
};
