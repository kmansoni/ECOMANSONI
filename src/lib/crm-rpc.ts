import { dbLoose } from "@/lib/supabase";
import type { Profession } from "./crm.types";

export class CRMRpcClient {
  protected profession: Profession;

  constructor(profession: Profession = 'default') {
    this.profession = profession;
  }

  setProfession(profession: Profession) {
    this.profession = profession;
  }

  getProfession(): Profession {
    return this.profession;
  }

  protected async rpcCall<T = unknown>(fn: string, params?: Record<string, unknown>): Promise<T> {
    const { data, error } = await dbLoose.rpc(fn, params ?? {});
    if (error) throw error;
    return data as T;
  }

  protected async rpcList<T>(fn: string, params?: Record<string, unknown>): Promise<T[]> {
    const data = await this.rpcCall<unknown>(fn, params);
    return Array.isArray(data) ? (data as T[]) : [];
  }

  protected async rpcSingle<T>(fn: string, params?: Record<string, unknown>): Promise<T | null> {
    const data = await this.rpcCall<unknown>(fn, params);
    if (Array.isArray(data)) {
      return (data[0] ?? null) as T | null;
    }
    if (data === null || data === undefined) {
      return null;
    }
    return data as T;
  }
}
