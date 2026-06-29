import type { Key } from 'react';

const INTERACTIVE_CLICK_SELECTOR = [
  'a',
  'button',
  'input',
  'label',
  'textarea',
  'select',
  '[role="button"]',
  '.ant-btn',
  '.ant-checkbox-wrapper',
  '.ant-dropdown-trigger',
  '.ant-picker',
  '.ant-select',
  '.ant-table-selection-column',
].join(', ');

export const toggleSelectionKey = (selectedKeys: Key[], targetKey: Key): Key[] => (
  selectedKeys.includes(targetKey)
    ? selectedKeys.filter((selectedKey) => selectedKey !== targetKey)
    : [...selectedKeys, targetKey]
);

export const isSelectionGuardClickTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return Boolean(target.closest(INTERACTIVE_CLICK_SELECTOR));
};
