import { cssVar, styled } from '@affine/component';
import React, { useEffect, useRef, useState } from 'react';

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

const StyledPanel = styled('div')<{
  top: number;
  left: number;
}>(({ top, left }) => ({
  position: 'fixed',
  top: `${top}px`,
  left: `${left}px`,
  zIndex: 100,
  width: '320px',
  maxHeight: '400px',
  background: cssVar('affine-background-secondary-color'),
  border: `1px solid ${cssVar('affine-border-color')}`,
  borderRadius: '8px',
  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
  overflowY: 'auto',
}));

const Header = styled('div')({
  padding: '16px',
  borderBottom: `1px solid ${cssVar('affine-border-color')}`,
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
});

const Title = styled('div')({
  fontSize: '14px',
  fontWeight: '600',
});

const CountBadge = styled('div')({
  background: cssVar('affine-background-primary-color'),
  color: cssVar('affine-text-primary-color'),
  padding: '2px 8px',
  borderRadius: '12px',
  fontSize: '12px',
  minWidth: '20px',
  textAlign: 'center',
});

const QuickAddRow = styled('div')({
  padding: '12px 16px',
  display: 'flex',
  gap: '8px',
});

const TodoInput = styled('input')({
  flex: 1,
  padding: '8px 12px',
  background: cssVar('affine-background-primary-color'),
  border: `1px solid ${cssVar('affine-border-color')}`,
  borderRadius: '6px',
  fontSize: '14px',
  outline: 'none',
  '&:focus': {
    borderColor: cssVar('affine-primary-color'),
  },
});

const AddButton = styled('button')({
  padding: '8px 16px',
  background: cssVar('affine-primary-color'),
  color: 'white',
  border: 'none',
  borderRadius: '6px',
  fontSize: '14px',
  cursor: 'pointer',
  '&:hover': {
    opacity: 0.9,
  },
});

const TodoItemRow = styled('div')({
  padding: '12px 16px',
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  '&:hover': {
    background: cssVar('affine-background-primary-color'),
  },
});

const TodoCheckbox = styled('input')({
  width: '16px',
  height: '16px',
  cursor: 'pointer',
});

const TodoText =
  styled('div', {
    shouldForwardProp: prop => prop !== 'done',
  }) <
  { done: boolean }(({ done }) => ({
    flex: 1,
    fontSize: '14px',
    color: cssVar('affine-text-primary-color'),
    ...(done && {
      textDecoration: 'line-through',
      opacity: 0.5,
    }),
  }));

const DeleteButton = styled('button')({
  padding: '4px 8px',
  background: 'transparent',
  color: cssVar('affine-text-secondary-color'),
  border: 'none',
  borderRadius: '4px',
  fontSize: '12px',
  cursor: 'pointer',
  '&:hover': {
    background: cssVar('affine-background-error-color'),
    color: 'white',
  },
});

const Separator = styled('div')({
  padding: '12px 16px',
  fontSize: '12px',
  color: cssVar('affine-text-secondary-color'),
  fontWeight: '500',
  borderBottom: `1px solid ${cssVar('affine-border-color')}`,
});

const EmptyState = styled('div')({
  padding: '32px 16px',
  textAlign: 'center',
  color: cssVar('affine-text-tertiary-color'),
  fontSize: '14px',
});

const StoryTodoPanel: React.FC<StoryTodoPanelProps> = ({
  open,
  onClose,
  anchorEl,
  todos,
  onAddTodo,
  onToggleTodo,
  onDeleteTodo,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const [inputValue, setInputValue] = useState('');
  const [position, setPosition] = useState({ top: 0, left: 0 });

  const pendingTodos = todos.filter(todo => !todo.done);
  const doneTodos = todos.filter(todo => todo.done);

  useEffect(() => {
    if (open && anchorEl) {
      const rect = anchorEl.getBoundingClientRect();
      const top = rect.bottom + window.scrollY;
      const left = rect.left + window.scrollX;
      setPosition({ top, left });
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
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscapeKey);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscapeKey);
    };
  }, [open, onClose]);

  const handleAddTodo = () => {
    if (inputValue.trim()) {
      onAddTodo(inputValue.trim());
      setInputValue('');
    }
  };

  const handleKeyPress = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') {
      handleAddTodo();
    }
  };

  if (!open) return null;

  return (
    <StyledPanel ref={panelRef} top={position.top} left={position.left}>
      <Header>
        <Title>📋 待办事项</Title>
        {pendingTodos.length > 0 && (
          <CountBadge>{pendingTodos.length}</CountBadge>
        )}
      </Header>

      <QuickAddRow>
        <TodoInput
          type="text"
          placeholder="添加待办..."
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          onKeyPress={handleKeyPress}
        />
        <AddButton onClick={handleAddTodo}>添加</AddButton>
      </QuickAddRow>

      {pendingTodos.length > 0 && (
        <>
          {pendingTodos.map(todo => (
            <TodoItemRow key={todo.id}>
              <TodoCheckbox
                type="checkbox"
                checked={false}
                onChange={() => onToggleTodo(todo.id)}
              />
              <TodoText done={todo.done}>{todo.text}</TodoText>
              <DeleteButton onClick={() => onDeleteTodo(todo.id)}>
                ×
              </DeleteButton>
            </TodoItemRow>
          ))}
        </>
      )}

      {doneTodos.length > 0 && (
        <>
          <Separator>已完成 ({doneTodos.length})</Separator>
          {doneTodos.map(todo => (
            <TodoItemRow key={todo.id}>
              <TodoCheckbox
                type="checkbox"
                checked={true}
                onChange={() => onToggleTodo(todo.id)}
              />
              <TodoText done={todo.done}>{todo.text}</TodoText>
              <DeleteButton onClick={() => onDeleteTodo(todo.id)}>
                ×
              </DeleteButton>
            </TodoItemRow>
          ))}
        </>
      )}

      {todos.length === 0 && <EmptyState>还没有待办事项</EmptyState>}
    </StyledPanel>
  );
};

export default StoryTodoPanel;
