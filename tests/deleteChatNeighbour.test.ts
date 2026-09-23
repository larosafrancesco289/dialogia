import assert from 'node:assert/strict';
import test from 'node:test';
import { neighbourChatId } from '@/lib/store/chatSlice';
import type { Chat } from '@/lib/types';

const chat = (id: string, folderId?: string) => ({ id, folderId }) as Chat;

test('deleting a chat selects the next one down in the same list', () => {
  const chats = [chat('a'), chat('b'), chat('c')];
  assert.equal(neighbourChatId(chats, 'b'), 'c');
});

test('deleting the last chat in a list selects the one above', () => {
  const chats = [chat('a'), chat('b'), chat('c')];
  assert.equal(neighbourChatId(chats, 'c'), 'b');
});

test('a chat in a folder hands over to a sibling in that folder', () => {
  const chats = [chat('r1'), chat('f1', 'F'), chat('r2'), chat('f2', 'F'), chat('r3')];
  assert.equal(neighbourChatId(chats, 'f1'), 'f2');
  assert.equal(neighbourChatId(chats, 'r2'), 'r3');
});

test('the only chat in its folder falls back to the nearest chat anywhere', () => {
  const chats = [chat('r1'), chat('f1', 'F'), chat('r2')];
  assert.equal(neighbourChatId(chats, 'f1'), 'r2');
  assert.equal(neighbourChatId([chat('only')], 'only'), undefined);
});
