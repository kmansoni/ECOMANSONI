/**
 * Timeweb Phone Auth Client SDK
 * 
 * Provides a TypeScript client for the phone authentication service.
 * Works with both Timeweb (primary) and Supabase (fallback).
 * 
 * Usage:
 * ```typescript
 * import { TimewebPhoneAuthClient } from '@/lib/auth/timeweb-phone-auth';
 * 
 * const authClient = new TimewebPhoneAuthClient({
 *   apiBaseUrl: 'https://api.mansoni.ru',
 *   fallbackToSupabase: true
 * });
 * 
 * // Request OTP
 * const { phone } = await authClient.requestOTP('+79991234567');
 * 
 * // Verify OTP
 * const { token, user } = await authClient.verifyOTP('+79991234567', '123456');
 * ```
 */

interface RequestOTPResponse {
  success: boolean;
  message: string;
  phone: string;
  expiresIn: number;
}

interface VerifyOTPResponse {
  success: boolean;
  token: string;
  error?: string;
  message?: string;
  user: {
    id: string;
    phone: string;
  };
}

interface AuthError {
  error: string;
  attemptsRemaining?: number;
}

export interface TimewebPhoneAuthClientConfig {
  apiBaseUrl: string;
  fallbackToSupabase?: boolean;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  timeout?: number;
}

export class TimewebPhoneAuthClient {
  private apiBaseUrl: string;
  private fallbackToSupabase: boolean;
  private supabaseUrl?: string;
  private supabaseAnonKey?: string;
  private timeout: number;
  private currentToken?: string;

  constructor(config: TimewebPhoneAuthClientConfig) {
    this.apiBaseUrl = config.apiBaseUrl.replace(/\/$/, ""); // Remove trailing slash
    this.fallbackToSupabase = config.fallbackToSupabase ?? false;
    this.supabaseUrl = config.supabaseUrl;
    this.supabaseAnonKey = config.supabaseAnonKey;
    this.timeout = config.timeout ?? 30000;
  }

  /**
   * Request OTP for phone number
   * 
   * @param phone Phone number in any format (will be normalized)
   * @returns Promise with masked phone and expiration time
   * @throws Error if service is unavailable
   */
  async requestOTP(phone: string): Promise<{ phone: string; expiresIn: number }> {
    try {
      const response = await this.fetch<RequestOTPResponse>(
        "/auth/phone/request-otp",
        {
          method: "POST",
          body: JSON.stringify({ phone }),
        }
      );

      if (!response.success) {
        throw new Error(response.message || "Failed to request OTP");
      }

      return {
        phone: response.phone,
        expiresIn: response.expiresIn,
      };
    } catch (error) {
      if (this.fallbackToSupabase) {
        console.warn("[Timeweb Auth] Falling back to Supabase for OTP request");
        return this.requestOTPSupabase(phone);
      }
      throw error;
    }
  }

  /**
   * Verify OTP and get JWT token
   * 
   * @param phone Phone number
   * @param otp 6-digit OTP code
   * @returns Promise with JWT token and user info
   * @throws Error if OTP is invalid or expired
   */
  async verifyOTP(
    phone: string,
    otp: string
  ): Promise<{ token: string; user: { id: string; phone: string } }> {
    try {
      const response = await this.fetch<VerifyOTPResponse>(
        "/auth/phone/verify",
        {
          method: "POST",
          body: JSON.stringify({ phone, otp }),
        }
      );

      if (!response.success) {
        throw new Error(response.error || response.message || "OTP verification failed");
      }

      // Store token for authenticated requests
      this.currentToken = response.token;

      // Persist token to localStorage (implementation detail)
      if (typeof window !== "undefined") {
        localStorage.setItem("auth_token", response.token);
      }

      return {
        token: response.token,
        user: response.user,
      };
    } catch (error) {
      if (this.fallbackToSupabase) {
        console.warn("[Timeweb Auth] Falling back to Supabase for OTP verification");
        return this.verifyOTPSupabase(phone, otp);
      }
      throw error;
    }
  }

  /**
   * Get current auth token
   */
  getToken(): string | undefined {
    return (
      this.currentToken ||
      (typeof window !== "undefined" ? localStorage.getItem("auth_token") ?? undefined : undefined)
    );
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    return !!this.getToken();
  }

  /**
   * Clear auth token (logout)
   */
  logout(): void {
    this.currentToken = undefined;
    if (typeof window !== "undefined") {
      localStorage.removeItem("auth_token");
    }
  }

  /**
   * Get Authorization header for API requests
   * 
   * Usage:
   * ```typescript
   * const response = await fetch('/api/user', {
   *   headers: authClient.getAuthHeaders()
   * });
   * ```
   */
  getAuthHeaders(): { Authorization: string } | {} {
    const token = this.getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  /**
   * Make authenticated fetch request
   */
  async fetchAuthenticated<T>(
    path: string,
    options?: RequestInit
  ): Promise<T> {
    return this.fetch<T>(path, {
      ...options,
      headers: {
        ...options?.headers,
        ...this.getAuthHeaders(),
      },
    });
  }

  /**
   * Internal fetch with timeout and error handling
   */
  private async fetch<T>(
    path: string,
    options?: RequestInit
  ): Promise<T> {
    const url = `${this.apiBaseUrl}${path}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          ...options?.headers,
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = (await response.json()) as AuthError;
        throw new Error(error.error || `HTTP ${response.status}`);
      }

      return response.json() as Promise<T>;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`Request timeout (${this.timeout}ms)`);
      }
      throw error;
    }
  }

  /**
   * Fallback: Request OTP via Supabase
   */
  private async requestOTPSupabase(phone: string): Promise<{ phone: string; expiresIn: number }> {
    if (!this.supabaseUrl || !this.supabaseAnonKey) {
      throw new Error(
        "Supabase credentials not configured for fallback"
      );
    }

    // TODO: Implement Supabase fallback (send-sms-otp function)
    console.warn("[Supabase Fallback] Not yet implemented");
    throw new Error("Supabase fallback not yet implemented");
  }

  /**
   * Fallback: Verify OTP via Supabase
   */
  private async verifyOTPSupabase(
    phone: string,
    otp: string
  ): Promise<{ token: string; user: { id: string; phone: string } }> {
    if (!this.supabaseUrl || !this.supabaseAnonKey) {
      throw new Error(
        "Supabase credentials not configured for fallback"
      );
    }

    // TODO: Implement Supabase fallback (verify-sms-otp function)
    console.warn("[Supabase Fallback] Not yet implemented");
    throw new Error("Supabase fallback not yet implemented");
  }
}

/**
 * Create a singleton instance of the auth client
 */
let authClientInstance: TimewebPhoneAuthClient | null = null;

export function createAuthClient(
  config: TimewebPhoneAuthClientConfig
): TimewebPhoneAuthClient {
  if (!authClientInstance) {
    authClientInstance = new TimewebPhoneAuthClient(config);
  }
  return authClientInstance;
}

export function getAuthClient(): TimewebPhoneAuthClient {
  if (!authClientInstance) {
    throw new Error("Auth client not initialized. Call createAuthClient() first.");
  }
  return authClientInstance;
}
