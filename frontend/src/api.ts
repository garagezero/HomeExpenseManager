// Thin fetch wrapper. Cookies carry the session, so we always send credentials.

export interface User {
  id: number;
  name: string;
  username: string;
  isAdmin: boolean;
  createdAt?: string;
}

export interface House {
  id: number;
  name: string;
  location?: string | null;
  createdAt?: string;
  typeCount?: number;
}

export interface Attachment {
  id: number;
  filename: string;
  mime: string;
  size: number;
}

export type Frequency = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
export type EntryStatus = "PAID" | "PARTIAL";

export interface PaymentType {
  id: number;
  houseId: number;
  name: string;
  frequency: Frequency;
  defaultAmount: number | null;
  createdAt?: string;
  entryCount?: number;
}

export interface PaymentEntry {
  id: number;
  paymentTypeId: number;
  periodKey: string;
  periodDate: string;
  status: EntryStatus;
  amount: number | null;
  note?: string | null;
  paidOn?: string | null;
  createdAt: string;
  transactionId?: number | null;
  attachments: Attachment[];
}

export interface TransactionEntry {
  id: number;
  periodKey: string;
  periodDate: string;
  status: EntryStatus;
  amount: number | null;
}

export interface Transaction {
  id: number;
  paymentTypeId: number;
  amount: number | null;
  status: EntryStatus;
  note?: string | null;
  paidOn?: string | null;
  createdAt: string;
  entries: TransactionEntry[];
  attachments: Attachment[];
}

export interface RecentEntry {
  id: number;
  typeName: string;
  houseId: number;
  houseName: string;
  periodDate: string;
  status: EntryStatus;
  amount: number | null;
}

export interface Summary {
  year: number | null;
  yearTotal: number;
  grandTotal: number;
  byMonth: { month: number; total: number }[];
  byHouse: { id: number; name: string; total: number }[];
  byYear: { year: number; total: number }[];
}

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    credentials: "include",
    ...options,
  });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

function json<T>(url: string, method: string, body?: unknown): Promise<T> {
  return request<T>(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

export const api = {
  // auth
  me: () => request<{ user: User }>("/api/auth/me"),
  login: (username: string, password: string) =>
    json<{ user: User }>("/api/auth/login", "POST", { username, password }),
  logout: () => json<{ ok: boolean }>("/api/auth/logout", "POST"),
  changePassword: (currentPassword: string, newPassword: string) =>
    json("/api/auth/change-password", "POST", { currentPassword, newPassword }),

  // users
  listUsers: () => request<{ users: User[] }>("/api/users"),
  createUser: (data: { name: string; username: string; password: string; isAdmin: boolean }) =>
    json<{ user: User }>("/api/users", "POST", data),
  updateUser: (id: number, data: Partial<Pick<User, "name" | "username" | "isAdmin">>) =>
    json<{ user: User }>(`/api/users/${id}`, "PUT", data),
  resetPassword: (id: number, newPassword: string) =>
    json(`/api/users/${id}/reset-password`, "POST", { newPassword }),
  deleteUser: (id: number) => json(`/api/users/${id}`, "DELETE"),

  // houses
  listHouses: () => request<{ houses: House[] }>("/api/houses"),
  getHouse: (id: number) => request<{ house: House }>(`/api/houses/${id}`),
  createHouse: (data: { name: string; location?: string }) =>
    json<{ house: House }>("/api/houses", "POST", data),
  updateHouse: (id: number, data: { name: string; location?: string }) =>
    json<{ house: House }>(`/api/houses/${id}`, "PUT", data),
  deleteHouse: (id: number) => json(`/api/houses/${id}`, "DELETE"),

  // payment types
  listTypes: (houseId: number) =>
    request<{ paymentTypes: PaymentType[] }>(`/api/payment-types?houseId=${houseId}`),
  createType: (data: {
    houseId: number;
    name: string;
    frequency: Frequency;
    defaultAmount: number | null;
  }) => json<{ paymentType: PaymentType }>("/api/payment-types", "POST", data),
  updateType: (
    id: number,
    data: { name?: string; frequency?: Frequency; defaultAmount?: number | null }
  ) => json<{ paymentType: PaymentType }>(`/api/payment-types/${id}`, "PUT", data),
  deleteType: (id: number) => json(`/api/payment-types/${id}`, "DELETE"),
  listEntries: (typeId: number, year: number) =>
    request<{ entries: PaymentEntry[] }>(`/api/payment-types/${typeId}/entries?year=${year}`),

  // entries
  upsertEntry: (form: FormData) =>
    request<{ entry: PaymentEntry }>("/api/entries", { method: "POST", body: form }),
  bulkUpsert: (form: FormData) =>
    request<{ ok: boolean; count: number; transactionId: number }>("/api/entries/bulk", {
      method: "POST",
      body: form,
    }),
  updateEntry: (
    id: number,
    data: { status?: EntryStatus; amount?: number | null; note?: string | null; paidOn?: string | null }
  ) => json<{ entry: PaymentEntry }>(`/api/entries/${id}`, "PUT", data),
  deleteEntry: (id: number) => json(`/api/entries/${id}`, "DELETE"),
  addEntryAttachments: (id: number, form: FormData) =>
    request<{ entry: PaymentEntry }>(`/api/entries/${id}/attachments`, {
      method: "POST",
      body: form,
    }),
  deleteAttachment: (attId: number) => json(`/api/entries/attachments/${attId}`, "DELETE"),
  attachmentUrl: (attId: number) => `/api/entries/attachments/${attId}/download`,

  // transactions (a payment applied to several periods at once)
  getTransaction: (id: number) => request<{ transaction: Transaction }>(`/api/transactions/${id}`),
  deleteTransaction: (id: number) => json(`/api/transactions/${id}`, "DELETE"),

  // stats
  years: () => request<{ years: number[] }>("/api/stats/years"),
  recent: () => request<{ recent: RecentEntry[] }>("/api/stats/recent"),
  summary: (params: { year?: number; houseId?: number } = {}) => {
    const qs = new URLSearchParams();
    if (params.year) qs.set("year", String(params.year));
    if (params.houseId) qs.set("houseId", String(params.houseId));
    const q = qs.toString();
    return request<Summary>(`/api/stats/summary${q ? `?${q}` : ""}`);
  },

  // settings
  getSettings: () => request<{ settings: Record<string, string> }>("/api/settings"),
  updateSettings: (data: { currency?: string; appName?: string }) =>
    json<{ settings: Record<string, string> }>("/api/settings", "PUT", data),

  // backup
  exportUrl: () => "/api/backup/export",
  importBackup: (form: FormData) =>
    request<{ ok: boolean; message: string }>("/api/backup/import", {
      method: "POST",
      body: form,
    }),
};
