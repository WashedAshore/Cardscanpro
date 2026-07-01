import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest, setAdminUserId, getStoredAdminUserId } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2,
  Shield,
  Tag,
  Users,
  CreditCard,
  Plus,
  Trash2,
  ToggleLeft,
  ToggleRight,
  CheckCircle2,
  AlertCircle,
  LogIn,
  UserPlus,
} from "lucide-react";
import type { User, PromoCode, Subscription } from "@shared/schema";

// ─── Types ───────────────────────────────────────────────────────────────────

interface AdminUser extends User {
  isAdmin: boolean;
}

interface AdminSession {
  user: AdminUser;
  token?: string;
}

type PromoType = "percentage" | "fixed" | "free_tier" | "free_trial";
type TierKey = "pro" | "elite" | "dealer";

const PROMO_TYPES: { value: PromoType; label: string }[] = [
  { value: "percentage", label: "Percentage (%)" },
  { value: "fixed", label: "Fixed Amount ($)" },
  { value: "free_tier", label: "Free Tier Grant" },
  { value: "free_trial", label: "Free Trial (days)" },
];

const PAID_TIERS: TierKey[] = ["pro", "elite", "dealer"];

// ─── Promo Codes Tab ─────────────────────────────────────────────────────────

function PromoCodesTab() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: promoCodes = [], isLoading } = useQuery<PromoCode[]>({
    queryKey: ["/api/admin/promo-codes"],
  });

  // Form state
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [discountType, setDiscountType] = useState<PromoType>("percentage");
  const [discountValue, setDiscountValue] = useState("");
  const [applicableTiers, setApplicableTiers] = useState<TierKey[]>(["pro", "elite", "dealer"]);
  const [maxUses, setMaxUses] = useState("");
  const [grantsTier, setGrantsTier] = useState<TierKey | "">("");
  const [grantsDays, setGrantsDays] = useState("");
  const [expiresAt, setExpiresAt] = useState("");

  const toggleTier = (tier: TierKey) => {
    setApplicableTiers((prev) =>
      prev.includes(tier) ? prev.filter((t) => t !== tier) : [...prev, tier]
    );
  };

  const createPromoMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/promo-codes", {
        code: code.toUpperCase().trim(),
        description: description.trim() || undefined,
        discountType,
        discountValue: Number(discountValue),
        applicableTiers: applicableTiers.join(","),
        maxUses: maxUses ? Number(maxUses) : undefined,
        grantsTier: (discountType === "free_tier" && grantsTier) ? grantsTier : undefined,
        grantsDays:
          (discountType === "free_tier" || discountType === "free_trial") && grantsDays
            ? Number(grantsDays)
            : undefined,
        expiresAt: expiresAt || undefined,
        createdBy: getAdminUserId(),
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Promo code created!" });
      qc.invalidateQueries({ queryKey: ["/api/admin/promo-codes"] });
      setCode("");
      setDescription("");
      setDiscountValue("");
      setMaxUses("");
      setGrantsTier("");
      setGrantsDays("");
      setExpiresAt("");
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      const res = await apiRequest("PATCH", `/api/admin/promo-codes/${id}`, { isActive: !isActive });
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/admin/promo-codes"] }),
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/admin/promo-codes/${id}`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Promo code deleted." });
      qc.invalidateQueries({ queryKey: ["/api/admin/promo-codes"] });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const valueLabel = () => {
    if (discountType === "percentage") return "Discount (%)";
    if (discountType === "fixed") return "Discount ($)";
    if (discountType === "free_tier") return "Days Granted";
    if (discountType === "free_trial") return "Trial Days";
    return "Value";
  };

  return (
    <div className="space-y-6">
      {/* Create Form */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Create Promo Code
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Code</Label>
              <Input
                placeholder="SUMMER25"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                className="uppercase font-mono"
                data-testid="input-promo-code-create"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Description</Label>
              <Input
                placeholder="Summer 2025 discount"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                data-testid="input-promo-description"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Type</Label>
              <Select value={discountType} onValueChange={(v) => setDiscountType(v as PromoType)}>
                <SelectTrigger data-testid="select-promo-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROMO_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{valueLabel()}</Label>
              <Input
                type="number"
                placeholder="e.g. 25"
                value={discountValue}
                onChange={(e) => setDiscountValue(e.target.value)}
                data-testid="input-promo-value"
              />
            </div>

            {/* Applicable Tiers */}
            <div className="space-y-2 md:col-span-2">
              <Label className="text-xs">Applicable Tiers</Label>
              <div className="flex gap-4">
                {PAID_TIERS.map((tier) => (
                  <div key={tier} className="flex items-center gap-1.5">
                    <Checkbox
                      id={`tier-${tier}`}
                      checked={applicableTiers.includes(tier)}
                      onCheckedChange={() => toggleTier(tier)}
                      data-testid={`checkbox-tier-${tier}`}
                    />
                    <Label htmlFor={`tier-${tier}`} className="text-xs capitalize cursor-pointer">
                      {tier}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Max Uses <span className="text-muted-foreground">(leave blank = unlimited)</span></Label>
              <Input
                type="number"
                placeholder="e.g. 100"
                value={maxUses}
                onChange={(e) => setMaxUses(e.target.value)}
                data-testid="input-promo-max-uses"
              />
            </div>

            {discountType === "free_tier" && (
              <div className="space-y-1.5">
                <Label className="text-xs">Grants Tier</Label>
                <Select value={grantsTier} onValueChange={(v) => setGrantsTier(v as TierKey)}>
                  <SelectTrigger data-testid="select-grants-tier">
                    <SelectValue placeholder="Select tier" />
                  </SelectTrigger>
                  <SelectContent>
                    {PAID_TIERS.map((t) => (
                      <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {(discountType === "free_tier" || discountType === "free_trial") && (
              <div className="space-y-1.5">
                <Label className="text-xs">Grants Days</Label>
                <Input
                  type="number"
                  placeholder="e.g. 30"
                  value={grantsDays}
                  onChange={(e) => setGrantsDays(e.target.value)}
                  data-testid="input-promo-grants-days"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs">Expires At <span className="text-muted-foreground">(optional)</span></Label>
              <Input
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                data-testid="input-promo-expires"
              />
            </div>
          </div>

          <Button
            className="mt-4"
            onClick={() => createPromoMutation.mutate()}
            disabled={createPromoMutation.isPending || !code.trim() || !discountValue}
            data-testid="button-create-promo"
          >
            {createPromoMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <Plus className="w-4 h-4 mr-2" />
            )}
            Create Promo Code
          </Button>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">All Promo Codes</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : promoCodes.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No promo codes yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Code</TableHead>
                    <TableHead className="text-xs">Type</TableHead>
                    <TableHead className="text-xs">Value</TableHead>
                    <TableHead className="text-xs">Uses</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {promoCodes.map((pc) => (
                    <TableRow key={pc.id} data-testid={`row-promo-${pc.id}`}>
                      <TableCell className="font-mono text-xs font-semibold">{pc.code}</TableCell>
                      <TableCell className="text-xs capitalize">{pc.discountType.replace("_", " ")}</TableCell>
                      <TableCell className="text-xs">
                        {pc.discountType === "percentage"
                          ? `${pc.discountValue}%`
                          : pc.discountType === "fixed"
                          ? `$${(pc.discountValue / 100).toFixed(2)}`
                          : `${pc.discountValue} days`}
                      </TableCell>
                      <TableCell className="text-xs">
                        {pc.currentUses}/{pc.maxUses ?? "∞"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={pc.isActive ? "default" : "outline"}
                          className={`text-xs ${pc.isActive ? "bg-green-500/20 text-green-700 dark:text-green-400 border-green-500/30 hover:bg-green-500/20" : ""}`}
                        >
                          {pc.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => toggleActiveMutation.mutate({ id: pc.id, isActive: pc.isActive })}
                            data-testid={`button-toggle-promo-${pc.id}`}
                            title={pc.isActive ? "Deactivate" : "Activate"}
                          >
                            {pc.isActive ? (
                              <ToggleRight className="w-4 h-4 text-green-500" />
                            ) : (
                              <ToggleLeft className="w-4 h-4 text-muted-foreground" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => deleteMutation.mutate(pc.id)}
                            data-testid={`button-delete-promo-${pc.id}`}
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Users Tab ────────────────────────────────────────────────────────────────

function UsersTab() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: userList = [], isLoading } = useQuery<AdminUser[]>({
    queryKey: ["/api/admin/users"],
  });

  const updateTierMutation = useMutation({
    mutationFn: async ({ id, tier }: { id: number; tier: string }) => {
      const res = await apiRequest("PATCH", `/api/admin/users/${id}`, { tier });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "User tier updated." });
      qc.invalidateQueries({ queryKey: ["/api/admin/users"] });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const toggleAdminMutation = useMutation({
    mutationFn: async ({ id, isAdmin }: { id: number; isAdmin: boolean }) => {
      const res = await apiRequest("PATCH", `/api/admin/users/${id}`, { isAdmin: !isAdmin });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Admin status updated." });
      qc.invalidateQueries({ queryKey: ["/api/admin/users"] });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">All Users</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : userList.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No users found.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Username</TableHead>
                  <TableHead className="text-xs">Email</TableHead>
                  <TableHead className="text-xs">Tier</TableHead>
                  <TableHead className="text-xs">Monthly Scans</TableHead>
                  <TableHead className="text-xs">Total Scans</TableHead>
                  <TableHead className="text-xs">Created</TableHead>
                  <TableHead className="text-xs">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {userList.map((u) => (
                  <TableRow key={u.id} data-testid={`row-user-${u.id}`}>
                    <TableCell className="text-xs font-medium">
                      <div className="flex items-center gap-1.5">
                        {u.username}
                        {u.isAdmin && (
                          <Badge variant="outline" className="text-xs py-0 px-1 border-amber-400 text-amber-600 dark:text-amber-400">
                            admin
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{u.email || "—"}</TableCell>
                    <TableCell>
                      <Select
                        value={u.tier}
                        onValueChange={(v) => updateTierMutation.mutate({ id: u.id, tier: v })}
                      >
                        <SelectTrigger className="h-7 text-xs w-28" data-testid={`select-user-tier-${u.id}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {["free", "pro", "elite", "dealer"].map((t) => (
                            <SelectItem key={t} value={t} className="text-xs capitalize">{t}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-xs">{u.monthlyScans}</TableCell>
                    <TableCell className="text-xs">{u.totalScans}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(u.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => toggleAdminMutation.mutate({ id: u.id, isAdmin: u.isAdmin })}
                        data-testid={`button-toggle-admin-${u.id}`}
                      >
                        {u.isAdmin ? "Revoke Admin" : "Make Admin"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Subscriptions Tab ────────────────────────────────────────────────────────

interface AdminSubscription extends Subscription {
  username?: string;
}

function SubscriptionsTab() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: subs = [], isLoading } = useQuery<AdminSubscription[]>({
    queryKey: ["/api/admin/subscriptions"],
  });

  const confirmMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/subscriptions/${id}/confirm`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Subscription confirmed!" });
      qc.invalidateQueries({ queryKey: ["/api/admin/subscriptions"] });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const statusColor = (status: string) => {
    switch (status) {
      case "confirmed": return "bg-green-500/20 text-green-700 dark:text-green-400 border-green-500/30 hover:bg-green-500/20";
      case "pending": return "bg-amber-500/20 text-amber-700 dark:text-amber-400 border-amber-500/30 hover:bg-amber-500/20";
      case "expired": return "text-muted-foreground";
      case "cancelled": return "text-destructive";
      default: return "";
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">All Subscriptions</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : subs.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No subscriptions yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">User</TableHead>
                  <TableHead className="text-xs">Tier</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs">BTC Tx</TableHead>
                  <TableHead className="text-xs">Amount</TableHead>
                  <TableHead className="text-xs">Promo</TableHead>
                  <TableHead className="text-xs">Created</TableHead>
                  <TableHead className="text-xs">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {subs.map((sub) => (
                  <TableRow key={sub.id} data-testid={`row-sub-${sub.id}`}>
                    <TableCell className="text-xs font-medium">
                      {sub.username || `User ${sub.userId}`}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs capitalize">{sub.tier}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-xs capitalize ${statusColor(sub.status)}`}>
                        {sub.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs font-mono max-w-24 truncate" title={sub.btcTxId || ""}>
                      {sub.btcTxId ? (
                        <span className="cursor-pointer hover:opacity-70" title={sub.btcTxId}>
                          {sub.btcTxId.slice(0, 10)}…
                        </span>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="text-xs">
                      {sub.usdAmount ? `$${sub.usdAmount}` : "—"}
                      {sub.btcAmount ? <span className="text-muted-foreground"> / {sub.btcAmount} BTC</span> : ""}
                    </TableCell>
                    <TableCell className="text-xs font-mono">{sub.promoCodeUsed || "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(sub.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      {sub.status === "pending" && (
                        <Button
                          size="sm"
                          className="h-7 text-xs bg-green-600 hover:bg-green-700 text-white"
                          onClick={() => confirmMutation.mutate(sub.id)}
                          disabled={confirmMutation.isPending}
                          data-testid={`button-confirm-sub-${sub.id}`}
                        >
                          <CheckCircle2 className="w-3 h-3 mr-1" />
                          Confirm
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main Admin Page ──────────────────────────────────────────────────────────

// Persisted admin user id — mirrored through localStorage helpers so that
// admin API calls auto-attach the X-Admin-User-Id header.
let adminUserId: number = getStoredAdminUserId() ?? 0;
export function getAdminUserId() { return adminUserId; }

export default function AdminPage() {
  const { toast } = useToast();

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [needsBootstrap, setNeedsBootstrap] = useState(false);
  const [loginError, setLoginError] = useState("");

  // Restore session from localStorage on mount
  useEffect(() => {
    const stored = getStoredAdminUserId();
    if (stored) {
      adminUserId = stored;
      setIsLoggedIn(true);
    }
  }, []);

  // Login form
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  // Bootstrap form
  const [bootUsername, setBootUsername] = useState("");
  const [bootPassword, setBootPassword] = useState("");
  const [bootEmail, setBootEmail] = useState("");
  const [bootToken, setBootToken] = useState("");

  const loginMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/login", { username, password });
      return res.json() as Promise<AdminSession>;
    },
    onSuccess: (data) => {
      if (data?.user?.id) {
        adminUserId = data.user.id;
        setAdminUserId(data.user.id);
      }
      setIsLoggedIn(true);
      setLoginError("");
    },
    onError: (err: Error) => {
      setLoginError(err.message.replace(/^\d+:\s*/, ""));
    },
  });

  const bootstrapMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/bootstrap", {
        username: bootUsername.trim(),
        password: bootPassword,
        email: bootEmail.trim() || undefined,
        bootstrapToken: bootToken.trim(),
      });
      return res.json() as Promise<AdminSession>;
    },
    onSuccess: () => {
      toast({ title: "Admin account created!", description: "You can now log in." });
      setNeedsBootstrap(false);
      setBootUsername("");
      setBootPassword("");
      setBootEmail("");
      setBootToken("");
    },
    onError: (err: Error) => {
      toast({ title: "Bootstrap failed", description: err.message, variant: "destructive" });
    },
  });

  // Bootstrap view
  if (needsBootstrap) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="w-4 h-4 text-amber-500" />
              Create Admin Account
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              No admin account exists yet. Set up the first administrator.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-sm">Username</Label>
              <Input
                placeholder="admin"
                value={bootUsername}
                onChange={(e) => setBootUsername(e.target.value)}
                data-testid="input-boot-username"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Email <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Input
                type="email"
                placeholder="admin@example.com"
                value={bootEmail}
                onChange={(e) => setBootEmail(e.target.value)}
                data-testid="input-boot-email"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Password</Label>
              <Input
                type="password"
                placeholder="Strong password"
                value={bootPassword}
                onChange={(e) => setBootPassword(e.target.value)}
                data-testid="input-boot-password"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">
                Bootstrap Token{" "}
                <span className="text-muted-foreground text-xs">(from ADMIN_BOOTSTRAP_TOKEN env var)</span>
              </Label>
              <Input
                type="password"
                placeholder="Server-side token"
                value={bootToken}
                onChange={(e) => setBootToken(e.target.value)}
                data-testid="input-boot-token"
              />
              <p className="text-[10px] text-muted-foreground">
                One-time setup token. Set ADMIN_BOOTSTRAP_TOKEN in Railway/server env, paste here. Bootstrap is locked once any admin exists.
              </p>
            </div>
            <Button
              className="w-full"
              onClick={() => bootstrapMutation.mutate()}
              disabled={bootstrapMutation.isPending || !bootUsername.trim() || !bootPassword || !bootToken.trim()}
              data-testid="button-bootstrap-submit"
            >
              {bootstrapMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <UserPlus className="w-4 h-4 mr-2" />
              )}
              Create Admin Account
            </Button>
            <button
              className="w-full text-center text-xs text-muted-foreground hover:text-primary mt-2"
              onClick={() => setNeedsBootstrap(false)}
              type="button"
            >
              Already have an admin account? Sign in
            </button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Login view
  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="w-4 h-4 text-amber-500" />
              Admin Login
            </CardTitle>
            <p className="text-xs text-muted-foreground">Sign in with your admin credentials.</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-sm">Username</Label>
              <Input
                placeholder="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                data-testid="input-admin-username"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Password</Label>
              <Input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && loginMutation.mutate()}
                data-testid="input-admin-password"
              />
            </div>

            {loginError && (
              <div className="flex items-start gap-2 rounded-md bg-destructive/10 text-destructive px-3 py-2 text-xs" data-testid="text-admin-login-error">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>{loginError}</span>
              </div>
            )}

            <Button
              className="w-full"
              onClick={() => loginMutation.mutate()}
              disabled={loginMutation.isPending || !username.trim() || !password}
              data-testid="button-admin-login"
            >
              {loginMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <LogIn className="w-4 h-4 mr-2" />
              )}
              Sign In
            </Button>
            <button
              className="w-full text-center text-xs text-muted-foreground hover:text-primary mt-2"
              onClick={() => setNeedsBootstrap(true)}
              type="button"
            >
              No admin account yet? Create one
            </button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Admin Dashboard
  return (
    <div className="min-h-screen bg-background">
      {/* Top Bar */}
      <div className="bg-primary text-primary-foreground px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-amber-400" />
          <span className="font-semibold text-sm">CardScan Pro — Admin Panel</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/10 text-xs"
          onClick={() => {
            adminUserId = 0;
            setAdminUserId(null);
            setIsLoggedIn(false);
          }}
          data-testid="button-admin-logout"
        >
          Sign Out
        </Button>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-4 py-6">
        <Tabs defaultValue="promo-codes">
          <TabsList className="mb-6">
            <TabsTrigger value="promo-codes" className="text-xs flex items-center gap-1.5" data-testid="tab-promo-codes">
              <Tag className="w-3.5 h-3.5" />
              Promo Codes
            </TabsTrigger>
            <TabsTrigger value="users" className="text-xs flex items-center gap-1.5" data-testid="tab-users">
              <Users className="w-3.5 h-3.5" />
              Users
            </TabsTrigger>
            <TabsTrigger value="subscriptions" className="text-xs flex items-center gap-1.5" data-testid="tab-subscriptions">
              <CreditCard className="w-3.5 h-3.5" />
              Subscriptions
            </TabsTrigger>
          </TabsList>

          <TabsContent value="promo-codes">
            <PromoCodesTab />
          </TabsContent>
          <TabsContent value="users">
            <UsersTab />
          </TabsContent>
          <TabsContent value="subscriptions">
            <SubscriptionsTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
