import { Routes } from '@angular/router';

// Mounted under each role (/patient/chat, /psychologist/chat).
export const CHAT_ROUTES: Routes = [
  { path: '', title: 'گفت‌وگو', loadComponent: () => import('./pages/chat.page').then((m) => m.ChatPage) },
  { path: ':conversationId', title: 'گفت‌وگو', loadComponent: () => import('./pages/chat.page').then((m) => m.ChatPage) },
];
