// Route NextAuth handlers — délègue à auth.ts.
// GET  → /api/auth/signin, /api/auth/signout, /api/auth/callback/*
// POST → /api/auth/signin, /api/auth/signout, /api/auth/callback/*

import { handlers } from '@/auth'

export const { GET, POST } = handlers
