import {
  createContext, useContext, useState, useEffect, useCallback,
  type ReactNode,
} from "react";
import { DEFAULT_SETTINGS, type Settings } from "@/lib/finance";

// ─── Types ───────────────────────────────────────────────────────────────────
export type Tx = {
  id: string;
  date: string;
  description: string;
  amount: number;
  category: string;
  note: string;
  type: "expense" | "income";
  created_at: string;
};

export type Injection = {
  id: string;
  source: string;
  amount: number;
  received_date: string;
  must_repay: boolean;
  repay_due_date: string | null;
  repaid: boolean;
  repaid_date: string | null;
  note: string;
  created_at: string;
};

export type TiltUse = {
  id: string;
  used_date: string;
  amount: number;
  delivery_type: "instant" | "standard";
  fee: number;
  repayment_plan: "1" | "2" | "4";
  apr: number;
  total_owed: number;
  note: string;
  created_at: string;
};

export type TiltPayment = {
  id: string;
  tilt_use_id: string;
  due_date: string;
  amount: number;
  paid: boolean;
  paid_date: string | null;
  created_at: string;
};

export type EarninWithdrawal = {
  id: string;
  withdraw_date: string;
  amount: number;
  repay_date: string;
  repaid: boolean;
  note: string;
  created_at: string;
};

export type SavingsEntry = {
  id: string;
  date: string;
  amount: number;
  type: "deposit" | "withdrawal";
  note: string;
  created_at: string;
};

export type AfterItem = {
  id: string;
  name: string;
  totalCost: number;
  numPayments: number;    // typically 4
  paymentAmount: number;  // totalCost / numPayments
  firstPaymentDate: string; // YYYY-MM-DD (date of first charge)
  frequencyDays: number;  // 14 = every 2 weeks
  paidCount: number;      // how many installments have been paid
  note: string;
  created_at: string;
};

export type WishItem = {
  id: string;
  name: string;
  estimatedPrice: number;
  link: string;
  notes: string;
  created_at: string;
};

// ─── Storage keys ────────────────────────────────────────────────────────────
const KEYS = {
  settings: "zfcc_settings",
  transactions: "zfcc_transactions",
  injections: "zfcc_injections",
  tiltUses: "zfcc_tilt_uses",
  tiltPayments: "zfcc_tilt_payments",
  earninWithdrawals: "zfcc_earnin_withdrawals",
  savings: "zfcc_savings",
  afterpay: "zfcc_afterpay",
  wishlist: "zfcc_wishlist",
} as const;

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, val: unknown) {
  localStorage.setItem(key, JSON.stringify(val));
}
function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
function now() {
  return new Date().toISOString();
}

// ─── Context type ─────────────────────────────────────────────────────────────
type AppCtx = {
  // Settings
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;

  // Transactions
  transactions: Tx[];
  addTransaction: (t: Omit<Tx, "id" | "created_at">) => void;
  updateTransaction: (id: string, patch: Partial<Omit<Tx, "id" | "created_at">>) => void;
  deleteTransaction: (id: string) => void;
  resetTransactions: () => void;

  // Injections
  injections: Injection[];
  addInjection: (i: Omit<Injection, "id" | "created_at">) => void;
  updateInjection: (id: string, patch: Partial<Omit<Injection, "id" | "created_at">>) => void;
  deleteInjection: (id: string) => void;

  // Tilt
  tiltUses: TiltUse[];
  tiltPayments: TiltPayment[];
  addTiltUse: (use: Omit<TiltUse, "id" | "created_at">, payments: Omit<TiltPayment, "id" | "created_at" | "tilt_use_id">[]) => void;
  updateTiltPayment: (id: string, patch: Partial<Omit<TiltPayment, "id" | "created_at">>) => void;
  deleteTiltUse: (id: string) => void;

  // EarnIn
  earninWithdrawals: EarninWithdrawal[];
  addEarninWithdrawal: (w: Omit<EarninWithdrawal, "id" | "created_at">) => void;
  updateEarninWithdrawal: (id: string, patch: Partial<Omit<EarninWithdrawal, "id" | "created_at">>) => void;
  deleteEarninWithdrawal: (id: string) => void;

  // Savings
  savings: SavingsEntry[];
  addSavings: (s: Omit<SavingsEntry, "id" | "created_at">) => void;
  deleteSavings: (id: string) => void;

  // Afterpay
  afterItems: AfterItem[];
  addAfterItem: (item: Omit<AfterItem, "id" | "created_at">) => void;
  updateAfterItem: (id: string, patch: Partial<Omit<AfterItem, "id" | "created_at">>) => void;
  deleteAfterItem: (id: string) => void;

  // Wish list
  wishItems: WishItem[];
  addWishItem: (item: Omit<WishItem, "id" | "created_at">) => void;
  updateWishItem: (id: string, patch: Partial<Omit<WishItem, "id" | "created_at">>) => void;
  deleteWishItem: (id: string) => void;
};

const AppContext = createContext<AppCtx | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(() => {
    // Merge with DEFAULT_SETTINGS so new fields added after initial save are always present
    const stored = load(KEYS.settings, DEFAULT_SETTINGS);
    return { ...DEFAULT_SETTINGS, ...stored };
  });
  const [transactions, setTransactions] = useState<Tx[]>(() =>
    load(KEYS.transactions, [])
  );
  const [injections, setInjections] = useState<Injection[]>(() =>
    load(KEYS.injections, [])
  );
  const [tiltUses, setTiltUses] = useState<TiltUse[]>(() =>
    load(KEYS.tiltUses, [])
  );
  const [tiltPayments, setTiltPayments] = useState<TiltPayment[]>(() =>
    load(KEYS.tiltPayments, [])
  );
  const [earninWithdrawals, setEarninWithdrawals] = useState<EarninWithdrawal[]>(() =>
    load(KEYS.earninWithdrawals, [])
  );
  const [savingsEntries, setSavings] = useState<SavingsEntry[]>(() =>
    load(KEYS.savings, [])
  );
  const [afterItems, setAfterItems] = useState<AfterItem[]>(() =>
    load(KEYS.afterpay, [])
  );
  const [wishItems, setWishItems] = useState<WishItem[]>(() =>
    load(KEYS.wishlist, [])
  );

  // Persist on every state change
  useEffect(() => { save(KEYS.settings, settings); }, [settings]);
  useEffect(() => { save(KEYS.transactions, transactions); }, [transactions]);
  useEffect(() => { save(KEYS.injections, injections); }, [injections]);
  useEffect(() => { save(KEYS.tiltUses, tiltUses); }, [tiltUses]);
  useEffect(() => { save(KEYS.tiltPayments, tiltPayments); }, [tiltPayments]);
  useEffect(() => { save(KEYS.earninWithdrawals, earninWithdrawals); }, [earninWithdrawals]);
  useEffect(() => { save(KEYS.savings, savingsEntries); }, [savingsEntries]);
  useEffect(() => { save(KEYS.afterpay, afterItems); }, [afterItems]);
  useEffect(() => { save(KEYS.wishlist, wishItems); }, [wishItems]);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((s) => ({ ...s, ...patch }));
  }, []);

  // Transactions
  const addTransaction = useCallback((t: Omit<Tx, "id" | "created_at">) => {
    setTransactions((prev) => [{ ...t, id: uid(), created_at: now() }, ...prev]);
  }, []);
  const updateTransaction = useCallback((id: string, patch: Partial<Omit<Tx, "id" | "created_at">>) => {
    setTransactions((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }, []);
  const deleteTransaction = useCallback((id: string) => {
    setTransactions((prev) => prev.filter((t) => t.id !== id));
  }, []);
  const resetTransactions = useCallback(() => setTransactions([]), []);

  // Injections
  const addInjection = useCallback((i: Omit<Injection, "id" | "created_at">) => {
    setInjections((prev) => [{ ...i, id: uid(), created_at: now() }, ...prev]);
  }, []);
  const updateInjection = useCallback((id: string, patch: Partial<Omit<Injection, "id" | "created_at">>) => {
    setInjections((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  }, []);
  const deleteInjection = useCallback((id: string) => {
    setInjections((prev) => prev.filter((x) => x.id !== id));
  }, []);

  // Tilt
  const addTiltUse = useCallback(
    (use: Omit<TiltUse, "id" | "created_at">, payments: Omit<TiltPayment, "id" | "created_at" | "tilt_use_id">[]) => {
      const useId = uid();
      setTiltUses((prev) => [{ ...use, id: useId, created_at: now() }, ...prev]);
      setTiltPayments((prev) => [
        ...payments.map((p) => ({ ...p, id: uid(), tilt_use_id: useId, created_at: now() })),
        ...prev,
      ]);
    },
    []
  );
  const updateTiltPayment = useCallback((id: string, patch: Partial<Omit<TiltPayment, "id" | "created_at">>) => {
    setTiltPayments((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }, []);
  const deleteTiltUse = useCallback((id: string) => {
    setTiltUses((prev) => prev.filter((u) => u.id !== id));
    setTiltPayments((prev) => prev.filter((p) => p.tilt_use_id !== id));
  }, []);

  // EarnIn
  const addEarninWithdrawal = useCallback((w: Omit<EarninWithdrawal, "id" | "created_at">) => {
    setEarninWithdrawals((prev) => [{ ...w, id: uid(), created_at: now() }, ...prev]);
  }, []);
  const updateEarninWithdrawal = useCallback((id: string, patch: Partial<Omit<EarninWithdrawal, "id" | "created_at">>) => {
    setEarninWithdrawals((prev) => prev.map((w) => (w.id === id ? { ...w, ...patch } : w)));
  }, []);
  const deleteEarninWithdrawal = useCallback((id: string) => {
    setEarninWithdrawals((prev) => prev.filter((w) => w.id !== id));
  }, []);

  // Savings
  const addSavings = useCallback((s: Omit<SavingsEntry, "id" | "created_at">) => {
    setSavings((prev) => [{ ...s, id: uid(), created_at: now() }, ...prev]);
  }, []);
  const deleteSavings = useCallback((id: string) => {
    setSavings((prev) => prev.filter((s) => s.id !== id));
  }, []);

  // Afterpay
  const addAfterItem = useCallback((item: Omit<AfterItem, "id" | "created_at">) => {
    setAfterItems((prev) => [{ ...item, id: uid(), created_at: now() }, ...prev]);
  }, []);
  const updateAfterItem = useCallback((id: string, patch: Partial<Omit<AfterItem, "id" | "created_at">>) => {
    setAfterItems((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  }, []);
  const deleteAfterItem = useCallback((id: string) => {
    setAfterItems((prev) => prev.filter((x) => x.id !== id));
  }, []);

  // Wish list
  const addWishItem = useCallback((item: Omit<WishItem, "id" | "created_at">) => {
    setWishItems((prev) => [{ ...item, id: uid(), created_at: now() }, ...prev]);
  }, []);
  const updateWishItem = useCallback((id: string, patch: Partial<Omit<WishItem, "id" | "created_at">>) => {
    setWishItems((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  }, []);
  const deleteWishItem = useCallback((id: string) => {
    setWishItems((prev) => prev.filter((x) => x.id !== id));
  }, []);

  return (
    <AppContext.Provider
      value={{
        settings, updateSettings,
        transactions, addTransaction, updateTransaction, deleteTransaction, resetTransactions,
        injections, addInjection, updateInjection, deleteInjection,
        tiltUses, tiltPayments, addTiltUse, updateTiltPayment, deleteTiltUse,
        earninWithdrawals, addEarninWithdrawal, updateEarninWithdrawal, deleteEarninWithdrawal,
        savings: savingsEntries, addSavings, deleteSavings,
        afterItems, addAfterItem, updateAfterItem, deleteAfterItem,
        wishItems, addWishItem, updateWishItem, deleteWishItem,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp outside AppProvider");
  return ctx;
}
