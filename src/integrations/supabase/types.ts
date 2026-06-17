/**
 * @deprecated Import from './types' or specific modules instead
 * Example: import type { Database } from './types/core'
 */
export type Database = {
  public: {
    Tables: {
      [key: string]: {
        Row: { [key: string]: Json | undefined }
        Insert: { [key: string]: Json | undefined }
        Update: { [key: string]: Json | undefined }
        Relationships: []
      }
    }
    Functions: {
      [key: string]: { Args: Record<string, unknown>; Returns: unknown }
    }
  }
}

export type Json = string | number | boolean | null | Json[] | { [key: string]: Json | undefined }
