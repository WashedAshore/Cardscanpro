import { useState, useCallback, useRef } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Link } from "wouter";
import { useUser } from "@/App";
import { AuthModal } from "@/pages/auth-modal";
import { TIERS, type TierKey } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Camera,
  Upload,
  Loader2,
  TrendingUp,
  DollarSign,
  AlertTriangle,
  Star,
  Zap,
  BarChart3,
  History,
  ChevronDown,
  ChevronUp,
  Info,
  Shield,
  ShoppingBag,
  Award,
  ExternalLink,
  CheckCircle2,
  XCircle,
  Gauge,
  User,
  LogOut,
  Crown,
  FolderPlus,
  Folder,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// Dropdown data
const SPORTS = [
  { value: "basketball", label: "Basketball (NBA)" },
  { value: "football", label: "Football (NFL)" },
  { value: "baseball", label: "Baseball (MLB)" },
  { value: "hockey", label: "Hockey (NHL)" },
  { value: "soccer", label: "Soccer / Football" },
  { value: "wnba", label: "WNBA" },
  { value: "pokemon", label: "Pokemon TCG" },
  { value: "other_tcg", label: "Other TCG (MTG, Yu-Gi-Oh)" },
  { value: "combat", label: "Combat Sports" },
  { value: "golf", label: "Golf / Racing / Other" },
];

const PLAYER_TIERS = [
  { value: "common", label: "Common / Role Player" },
  { value: "starter", label: "Starter / Solid Player" },
  { value: "star", label: "Star / All-Star" },
  { value: "superstar", label: "Superstar / MVP" },
  { value: "goat", label: "GOAT Tier" },
];

const BRAND_TIERS = [
  { value: "budget", label: "Budget (Donruss, Hoops, Score)" },
  { value: "mid", label: "Mid-Tier (Prizm, Select, Mosaic)" },
  { value: "upper_mid", label: "Upper-Mid (Spectra, Obsidian)" },
  { value: "premium", label: "Premium (NT, Flawless, Immaculate)" },
];

const PRINT_RUNS = [
  { value: "unlimited", label: "Unnumbered / Base" },
  { value: "999", label: "/999" },
  { value: "499", label: "/499" },
  { value: "299", label: "/299" },
  { value: "199", label: "/199" },
  { value: "149", label: "/149" },
  { value: "99", label: "/99" },
  { value: "75", label: "/75" },
  { value: "49", label: "/49" },
  { value: "25", label: "/25" },
  { value: "10", label: "/10" },
  { value: "5", label: "/5" },
  { value: "1", label: "1/1 (One-of-One)" },
];

const GRADERS = [
  { value: "raw", label: "Raw / Ungraded" },
  { value: "psa", label: "PSA" },
  { value: "bgs", label: "BGS (Beckett)" },
  { value: "sgc", label: "SGC" },
  { value: "cgc", label: "CGC" },
];

const GRADES: Record<string, Array<{ value: string; label: string }>> = {
  raw: [{ value: "raw", label: "Raw (Ungraded)" }],
  psa: [
    { value: "10", label: "PSA 10 — Gem Mint" },
    { value: "9", label: "PSA 9 — Mint" },
    { value: "8.5", label: "PSA 8.5 — NM-MT+" },
    { value: "8", label: "PSA 8 — NM-MT" },
    { value: "7", label: "PSA 7 — NM" },
    { value: "6", label: "PSA 6 — EX-MT" },
    { value: "5", label: "PSA 5 — EX" },
    { value: "4", label: "PSA 4 — VG-EX" },
    { value: "3", label: "PSA 3 — VG" },
    { value: "2", label: "PSA 2 — Good" },
    { value: "1", label: "PSA 1 — Poor" },
  ],
  bgs: [
    { value: "10", label: "BGS 10 — Black Label" },
    { value: "9.5", label: "BGS 9.5 — Gem Mint" },
    { value: "9", label: "BGS 9 — Mint" },
    { value: "8.5", label: "BGS 8.5 — NM-MT+" },
    { value: "8", label: "BGS 8 — NM-MT" },
    { value: "7", label: "BGS 7 — NM" },
  ],
  sgc: [
    { value: "10", label: "SGC 10 — Pristine" },
    { value: "9.5", label: "SGC 9.5 — Mint+" },
    { value: "9", label: "SGC 9 — Mint" },
    { value: "8", label: "SGC 8 — NM-MT" },
    { value: "7", label: "SGC 7 — NM" },
  ],
  cgc: [
    { value: "10", label: "CGC 10 — Pristine" },
    { value: "9.5", label: "CGC 9.5 — Gem Mint" },
    { value: "9", label: "CGC 9 — Mint" },
    { value: "8", label: "CGC 8 — NM-MT" },
  ],
};

const AUTO_TYPES = [
  { value: "none", label: "No Autograph" },
  { value: "sticker", label: "Sticker Auto" },
  { value: "on_card", label: "On-Card Auto" },
  { value: "rpa", label: "Rookie Patch Auto (RPA)" },
  { value: "logoman", label: "Logoman Auto" },
  { value: "cut_sig", label: "Cut Signature" },
  { value: "dual_auto", label: "Dual Auto" },
  { value: "triple_auto", label: "Triple Auto" },
  { value: "inscription", label: "Inscription Auto" },
];

function formatCurrency(value: number): string {
  if (value >= 1000000) return `$${(value / 1000000).toFixed(2)}M`;
  if (value >= 100000) return `$${(value / 1000).toFixed(1)}K`;
  if (value >= 1000)
    return `$${value.toLocaleString("en-US", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })}`;
  return `$${value.toFixed(2)}`;
}

interface CardFields {
  sport: string;
  playerName: string;
  playerTier: string;
  brandTier: string;
  setName: string;
  year: string;
  printRun: string;
  grader: string;
  grade: string;
  autoType: string;
  isRookie: boolean;
  serialNumber: string;
  playerJersey: string;
  baseCardValue: number;
}

const defaultFields: CardFields = {
  sport: "basketball",
  playerName: "",
  playerTier: "common",
  brandTier: "budget",
  setName: "",
  year: "",
  printRun: "unlimited",
  grader: "raw",
  grade: "raw",
  autoType: "none",
  isRookie: false,
  serialNumber: "",
  playerJersey: "",
  baseCardValue: 1,
};

export default function AnalyzerPage() {
  const { toast } = useToast();
  const { user, setUser } = useUser();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fields, setFields] = useState<CardFields>(defaultFields);
  const [valuation, setValuation] = useState<any>(null);
  const [cardDescription, setCardDescription] = useState<string>("");
  const [aiConfidence, setAiConfidence] = useState<string>("");
  const [showBreakdown, setShowBreakdown] = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  const [gradingRec, setGradingRec] = useState<any>(null);
  const [sellingRec, setSellingRec] = useState<any>(null);
  const [showGraderAlts, setShowGraderAlts] = useState(false);
  const [showPlatformAlts, setShowPlatformAlts] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');

  // Fetch analysis history
  const { data: history } = useQuery<any[]>({
    queryKey: ["/api/analyses"],
  });

  // AI analysis mutation
  const analyzeMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("image", file);
      const res = await fetch(
        `${"__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__"}/api/analyze`,
        {
          method: "POST",
          body: formData,
        }
      );
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Analysis failed");
      }
      return res.json();
    },
    onSuccess: (data) => {
      const cd = data.cardData;
      setFields({
        sport: cd.sport || "basketball",
        playerName: cd.playerName || "",
        playerTier: cd.playerTier || "common",
        brandTier: cd.brandTier || "budget",
        setName: cd.setName || "",
        year: cd.year || "",
        printRun: cd.printRun || "unlimited",
        grader: cd.grader || "raw",
        grade: cd.grade || "raw",
        autoType: cd.autoType || "none",
        isRookie: cd.isRookie || false,
        serialNumber: cd.serialNumber || "",
        playerJersey: cd.playerJersey || "",
        baseCardValue: cd.baseCardValue || 1,
      });
      setValuation(data.valuation);
      setGradingRec(data.gradingRecommendation || null);
      setSellingRec(data.sellingRecommendation || null);
      setCardDescription(data.cardDescription || "");
      setAiConfidence(cd.confidence || "medium");
      setShowGraderAlts(false);
      setShowPlatformAlts(false);
      queryClient.invalidateQueries({ queryKey: ["/api/analyses"] });
      toast({
        title: "Card Identified",
        description: `${cd.playerName} — ${cd.setName || "Unknown Set"}`,
      });
    },
    onError: (err: any) => {
      toast({
        title: "Analysis Failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  // Manual valuation mutation
  const valuateMutation = useMutation({
    mutationFn: async (cardInput: any) => {
      const res = await apiRequest("POST", "/api/valuate", cardInput);
      return res.json();
    },
    onSuccess: (data) => {
      setValuation(data.valuation);
      setGradingRec(data.gradingRecommendation || null);
      setSellingRec(data.sellingRecommendation || null);
      setShowGraderAlts(false);
      setShowPlatformAlts(false);
      toast({
        title: "Valuation Updated",
        description: `FMV: ${formatCurrency(data.valuation.estimatedFmv)}`,
      });
    },
  });

  const handleFileSelect = useCallback(
    (file: File) => {
      if (!file.type.startsWith("image/")) {
        toast({
          title: "Invalid file",
          description: "Please upload an image file",
          variant: "destructive",
        });
        return;
      }
      setSelectedFile(file);
      const reader = new FileReader();
      reader.onload = (e) => setImagePreview(e.target?.result as string);
      reader.readAsDataURL(file);
    },
    [toast]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) handleFileSelect(file);
    },
    [handleFileSelect]
  );

  const handleAnalyze = () => {
    if (selectedFile) {
      analyzeMutation.mutate(selectedFile);
    }
  };

  const handleRecalculate = () => {
    valuateMutation.mutate({
      sport: fields.sport,
      playerTier: fields.playerTier,
      brandTier: fields.brandTier,
      printRun: fields.printRun,
      grader: fields.grader,
      grade: fields.grade,
      autoType: fields.autoType,
      isRookie: fields.isRookie,
      baseCardValue: fields.baseCardValue,
      serialNumber: fields.serialNumber || undefined,
      playerJersey: fields.playerJersey || undefined,
    });
  };

  const updateField = (key: keyof CardFields, value: any) => {
    setFields((prev) => {
      const updated = { ...prev, [key]: value };
      if (key === "grader") {
        const gradeOptions = GRADES[value] || GRADES.raw;
        updated.grade = gradeOptions[0]?.value || "raw";
      }
      return updated;
    });
  };

  const isAnalyzing = analyzeMutation.isPending;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <Camera className="w-4 h-4 text-primary-foreground" />
            </div>
            <div>
              <h1 className="font-semibold text-foreground leading-tight" data-testid="text-app-title">
                CardScan Pro
              </h1>
              <p className="text-xs text-muted-foreground">
                AI-Powered Card Analysis & Valuation
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/pricing">
              <Button variant="ghost" size="sm" data-testid="link-pricing">
                <Crown className="w-4 h-4 mr-1" />
                Plans
              </Button>
            </Link>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowHistory(!showHistory)}
              data-testid="button-history"
            >
              <History className="w-4 h-4 mr-1" />
              History
              {history && history.length > 0 && (
                <Badge variant="secondary" className="ml-1.5 text-xs px-1.5">
                  {history.length}
                </Badge>
              )}
            </Button>
            {user ? (
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  <User className="w-3 h-3 mr-1" />
                  {user.username}
                  {user.tier !== "free" && (
                    <span className="ml-1 text-primary font-semibold">{user.tier.toUpperCase()}</span>
                  )}
                </Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setUser(null)}
                  data-testid="button-logout"
                  title="Log out"
                >
                  <LogOut className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <Button
                size="sm"
                onClick={() => { setAuthMode('login'); setShowAuthModal(true); }}
                data-testid="button-login"
              >
                <User className="w-4 h-4 mr-1" />
                Sign In
              </Button>
            )}
          </div>
        </div>
      </header>

      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onAuth={(u: any) => { setUser(u); setShowAuthModal(false); }}
        mode={authMode}
      />

      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* History panel */}
        {showHistory && history && history.length > 0 && (
          <Card className="mb-6">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Recent Analyses</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {history.slice(0, 12).map((item: any) => (
                  <button
                    key={item.id}
                    className="text-left p-2 rounded-lg border border-border hover:border-primary/50 transition-colors"
                    onClick={() => {
                      setFields({
                        sport: item.sport,
                        playerName: item.playerName,
                        playerTier: item.playerTier,
                        brandTier: item.brandTier,
                        setName: item.setName || "",
                        year: item.year || "",
                        printRun: item.printRun,
                        grader: item.grader,
                        grade: item.grade,
                        autoType: item.autoType,
                        isRookie: item.isRookie,
                        serialNumber: item.serialNumber || "",
                        playerJersey: item.playerJersey || "",
                        baseCardValue: item.baseCardValue,
                      });
                      if (item.imageUrl) setImagePreview(item.imageUrl);
                      handleRecalculate();
                      setShowHistory(false);
                    }}
                    data-testid={`button-history-item-${item.id}`}
                  >
                    {item.imageUrl && (
                      <img
                        src={item.imageUrl}
                        alt={item.playerName}
                        className="w-full aspect-[3/4] object-cover rounded mb-1"
                      />
                    )}
                    <p className="text-xs font-medium truncate">
                      {item.playerName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatCurrency(item.estimatedFmv)}
                    </p>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column — Upload + Image */}
          <div className="lg:col-span-4 space-y-4">
            {/* Upload Zone */}
            <Card>
              <CardContent className="pt-5">
                <div
                  className={`relative border-2 border-dashed rounded-xl p-6 text-center transition-colors cursor-pointer ${
                    isAnalyzing
                      ? "border-primary/50 bg-primary/5"
                      : imagePreview
                      ? "border-border"
                      : "border-muted-foreground/25 hover:border-primary/50"
                  }`}
                  onDrop={handleDrop}
                  onDragOver={(e) => e.preventDefault()}
                  onClick={() => fileInputRef.current?.click()}
                  data-testid="dropzone-upload"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileSelect(file);
                    }}
                    data-testid="input-file"
                  />

                  {imagePreview ? (
                    <img
                      src={imagePreview}
                      alt="Card preview"
                      className="mx-auto max-h-72 rounded-lg object-contain"
                      data-testid="img-preview"
                    />
                  ) : (
                    <div className="py-8">
                      <Upload className="w-10 h-10 mx-auto text-muted-foreground/50 mb-3" />
                      <p className="text-sm font-medium text-foreground">
                        Drop a card photo here
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        or click to browse — JPG, PNG, WEBP up to 10MB
                      </p>
                    </div>
                  )}
                </div>

                {selectedFile && (
                  <Button
                    className="w-full mt-4"
                    onClick={handleAnalyze}
                    disabled={isAnalyzing}
                    data-testid="button-analyze"
                  >
                    {isAnalyzing ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Analyzing Card...
                      </>
                    ) : (
                      <>
                        <Zap className="w-4 h-4 mr-2" />
                        Analyze with AI
                      </>
                    )}
                  </Button>
                )}

                {cardDescription && (
                  <div className="mt-4 p-3 bg-muted/50 rounded-lg">
                    <div className="flex items-start gap-2">
                      <Info className="w-4 h-4 mt-0.5 text-primary shrink-0" />
                      <div>
                        <p className="text-xs text-foreground">{cardDescription}</p>
                        {aiConfidence && (
                          <Badge
                            variant={
                              aiConfidence === "high"
                                ? "default"
                                : aiConfidence === "medium"
                                ? "secondary"
                                : "outline"
                            }
                            className="mt-1.5 text-xs"
                          >
                            AI Confidence: {aiConfidence}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Market Trend Card */}
            {valuation?.marketTrend && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-primary" />
                    Market Trend
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground leading-relaxed" data-testid="text-market-trend">
                    {valuation.marketTrend}
                  </p>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Middle Column — Card Details (Editable) */}
          <div className="lg:col-span-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">
                  Card Details
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  AI-detected fields — edit to refine
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Player Name */}
                <div>
                  <Label className="text-xs">Player / Character</Label>
                  <Input
                    value={fields.playerName}
                    onChange={(e) => updateField("playerName", e.target.value)}
                    placeholder="e.g. LeBron James"
                    className="mt-1"
                    data-testid="input-player-name"
                  />
                </div>

                {/* Set / Year Row */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2">
                    <Label className="text-xs">Set / Product</Label>
                    <Input
                      value={fields.setName}
                      onChange={(e) => updateField("setName", e.target.value)}
                      placeholder="e.g. Panini Prizm"
                      className="mt-1"
                      data-testid="input-set-name"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Year</Label>
                    <Input
                      value={fields.year}
                      onChange={(e) => updateField("year", e.target.value)}
                      placeholder="2024"
                      className="mt-1"
                      data-testid="input-year"
                    />
                  </div>
                </div>

                {/* Sport */}
                <div>
                  <Label className="text-xs">Sport / Category</Label>
                  <Select
                    value={fields.sport}
                    onValueChange={(v) => updateField("sport", v)}
                  >
                    <SelectTrigger className="mt-1" data-testid="select-sport">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SPORTS.map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Player Tier */}
                <div>
                  <Label className="text-xs">Player Tier</Label>
                  <Select
                    value={fields.playerTier}
                    onValueChange={(v) => updateField("playerTier", v)}
                  >
                    <SelectTrigger className="mt-1" data-testid="select-player-tier">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PLAYER_TIERS.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Brand Tier */}
                <div>
                  <Label className="text-xs">Brand / Set Tier</Label>
                  <Select
                    value={fields.brandTier}
                    onValueChange={(v) => updateField("brandTier", v)}
                  >
                    <SelectTrigger className="mt-1" data-testid="select-brand-tier">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {BRAND_TIERS.map((b) => (
                        <SelectItem key={b.value} value={b.value}>
                          {b.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Print Run */}
                <div>
                  <Label className="text-xs">Print Run</Label>
                  <Select
                    value={fields.printRun}
                    onValueChange={(v) => updateField("printRun", v)}
                  >
                    <SelectTrigger className="mt-1" data-testid="select-print-run">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PRINT_RUNS.map((p) => (
                        <SelectItem key={p.value} value={p.value}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Grader + Grade Row */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Grader</Label>
                    <Select
                      value={fields.grader}
                      onValueChange={(v) => updateField("grader", v)}
                    >
                      <SelectTrigger className="mt-1" data-testid="select-grader">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {GRADERS.map((g) => (
                          <SelectItem key={g.value} value={g.value}>
                            {g.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Grade</Label>
                    <Select
                      value={fields.grade}
                      onValueChange={(v) => updateField("grade", v)}
                    >
                      <SelectTrigger className="mt-1" data-testid="select-grade">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(GRADES[fields.grader] || GRADES.raw).map((g) => (
                          <SelectItem key={g.value} value={g.value}>
                            {g.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Auto Type */}
                <div>
                  <Label className="text-xs">Autograph Type</Label>
                  <Select
                    value={fields.autoType}
                    onValueChange={(v) => updateField("autoType", v)}
                  >
                    <SelectTrigger className="mt-1" data-testid="select-auto-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {AUTO_TYPES.map((a) => (
                        <SelectItem key={a.value} value={a.value}>
                          {a.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Rookie + Base Value Row */}
                <div className="grid grid-cols-2 gap-2 items-end">
                  <div>
                    <Label className="text-xs">Base Card Value ($)</Label>
                    <Input
                      type="number"
                      min={0.01}
                      step={0.01}
                      value={fields.baseCardValue}
                      onChange={(e) =>
                        updateField(
                          "baseCardValue",
                          parseFloat(e.target.value) || 1
                        )
                      }
                      className="mt-1"
                      data-testid="input-base-value"
                    />
                  </div>
                  <div className="flex items-center gap-2 pb-1.5">
                    <Switch
                      checked={fields.isRookie}
                      onCheckedChange={(v) => updateField("isRookie", v)}
                      data-testid="switch-rookie"
                    />
                    <Label className="text-xs">Rookie Card</Label>
                  </div>
                </div>

                {/* Serial / Jersey Row */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Serial Number</Label>
                    <Input
                      value={fields.serialNumber}
                      onChange={(e) =>
                        updateField("serialNumber", e.target.value)
                      }
                      placeholder="e.g. 23"
                      className="mt-1"
                      data-testid="input-serial"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Jersey Number</Label>
                    <Input
                      value={fields.playerJersey}
                      onChange={(e) =>
                        updateField("playerJersey", e.target.value)
                      }
                      placeholder="e.g. 23"
                      className="mt-1"
                      data-testid="input-jersey"
                    />
                  </div>
                </div>

                <Button
                  className="w-full mt-2"
                  variant="secondary"
                  onClick={handleRecalculate}
                  disabled={valuateMutation.isPending}
                  data-testid="button-recalculate"
                >
                  {valuateMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <BarChart3 className="w-4 h-4 mr-2" />
                  )}
                  Recalculate Valuation
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Right Column — Valuation Results */}
          <div className="lg:col-span-4 space-y-4">
            {valuation ? (
              <>
                {/* FMV Hero */}
                <Card className="border-primary/30 bg-primary/5">
                  <CardContent className="pt-5">
                    <div className="text-center">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Estimated Fair Market Value
                      </p>
                      <p
                        className="text-3xl font-bold text-primary mt-1"
                        data-testid="text-fmv"
                      >
                        {formatCurrency(valuation.estimatedFmv)}
                      </p>
                      <Badge
                        variant={
                          valuation.confidence === "high"
                            ? "default"
                            : valuation.confidence === "medium"
                            ? "secondary"
                            : "outline"
                        }
                        className="mt-2"
                      >
                        {valuation.confidence} confidence
                      </Badge>
                    </div>
                  </CardContent>
                </Card>

                {/* Selling Prices */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <DollarSign className="w-4 h-4 text-primary" />
                      Selling Guide
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="text-xs font-medium">
                            eBay BIN (Best Offer)
                          </p>
                          <p className="text-xs text-muted-foreground">
                            List at FMV + 25%
                          </p>
                        </div>
                        <p className="font-semibold text-sm" data-testid="text-bin">
                          {formatCurrency(valuation.optimalListBin)}
                        </p>
                      </div>
                      <Separator />
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="text-xs font-medium">Auction Start</p>
                          <p className="text-xs text-muted-foreground">
                            Price discovery ~95% FMV
                          </p>
                        </div>
                        <p className="font-semibold text-sm" data-testid="text-auction">
                          {formatCurrency(valuation.optimalListAuction)}
                        </p>
                      </div>
                      <Separator />
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="text-xs font-medium">
                            Net Proceeds (BIN)
                          </p>
                          <p className="text-xs text-muted-foreground">
                            After 13.25% eBay fee + shipping
                          </p>
                        </div>
                        <p className="font-semibold text-sm text-green-600 dark:text-green-400" data-testid="text-net-bin">
                          {formatCurrency(valuation.netProceedsBin)}
                        </p>
                      </div>
                      <Separator />
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="text-xs font-medium">
                            Dealer Cash Offer
                          </p>
                          <p className="text-xs text-muted-foreground">
                            ~60% of FMV (industry standard)
                          </p>
                        </div>
                        <p className="font-semibold text-sm text-muted-foreground" data-testid="text-dealer">
                          {formatCurrency(valuation.dealerCashOffer)}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Multiplier Breakdown */}
                <Card>
                  <CardHeader className="pb-2">
                    <button
                      className="flex items-center justify-between w-full"
                      onClick={() => setShowBreakdown(!showBreakdown)}
                      data-testid="button-toggle-breakdown"
                    >
                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <BarChart3 className="w-4 h-4 text-primary" />
                        Multiplier Breakdown
                      </CardTitle>
                      {showBreakdown ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </button>
                  </CardHeader>
                  {showBreakdown && (
                    <CardContent>
                      <div className="space-y-2">
                        {valuation.breakdown?.map(
                          (item: any, i: number) => (
                            <div
                              key={i}
                              className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0"
                            >
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium">
                                  {item.factor}
                                </p>
                                <p className="text-xs text-muted-foreground truncate">
                                  {item.description}
                                </p>
                              </div>
                              <div className="text-right ml-3">
                                <p className="text-xs font-mono font-semibold">
                                  {item.multiplier >= 10
                                    ? `${item.multiplier.toLocaleString()}x`
                                    : `${item.multiplier}x`}
                                </p>
                                <p className="text-xs text-muted-foreground font-mono">
                                  {item.low}–{item.high >= 10 ? item.high.toLocaleString() : item.high}x
                                </p>
                              </div>
                            </div>
                          )
                        )}
                      </div>
                    </CardContent>
                  )}
                </Card>

                {/* Notes / Tips */}
                {valuation.notes?.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <Star className="w-4 h-4 text-primary" />
                        Notes & Tips
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2">
                        {valuation.notes.map(
                          (note: string, i: number) => (
                            <li
                              key={i}
                              className="flex items-start gap-2 text-xs text-muted-foreground"
                            >
                              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 text-yellow-500 shrink-0" />
                              <span>{note}</span>
                            </li>
                          )
                        )}
                      </ul>
                    </CardContent>
                  </Card>
                )}

                {/* ===== GRADING RECOMMENDATION ===== */}
                {gradingRec && (
                  <Card className={gradingRec.score >= 7 ? "border-green-500/30 bg-green-500/5" : gradingRec.score >= 4 ? "border-yellow-500/20" : ""}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <Shield className="w-4 h-4 text-primary" />
                        Grading Recommendation
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {/* Score gauge + verdict */}
                      <div className="flex items-center gap-4 mb-3">
                        <div className="relative w-16 h-16 shrink-0">
                          <svg viewBox="0 0 36 36" className="w-16 h-16 -rotate-90">
                            <path
                              className="text-muted/50"
                              d="M18 2.0845a 15.9155 15.9155 0 0 1 0 31.831 15.9155 15.9155 0 0 1 0 -31.831"
                              fill="none" stroke="currentColor" strokeWidth="3"
                            />
                            <path
                              className={gradingRec.score >= 7 ? "text-green-500" : gradingRec.score >= 4 ? "text-yellow-500" : "text-red-500"}
                              d="M18 2.0845a 15.9155 15.9155 0 0 1 0 31.831 15.9155 15.9155 0 0 1 0 -31.831"
                              fill="none" stroke="currentColor" strokeWidth="3"
                              strokeDasharray={`${gradingRec.score * 10}, 100`}
                            />
                          </svg>
                          <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-lg font-bold" data-testid="text-grade-score">{gradingRec.score}</span>
                          </div>
                        </div>
                        <div>
                          <Badge variant={gradingRec.score >= 7 ? "default" : gradingRec.score >= 4 ? "secondary" : "outline"} className="mb-1">
                            {gradingRec.verdict}
                          </Badge>
                          <p className="text-xs text-muted-foreground">
                            Grade-worthiness score (1-10)
                          </p>
                        </div>
                      </div>

                      {/* Suggested grader */}
                      <div className="p-2.5 bg-muted/40 rounded-lg mb-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Award className="w-4 h-4 text-primary" />
                            <span className="text-xs font-semibold">
                              {gradingRec.verdict === "Already Graded" ? "Crossover Advice" : `Suggested: ${gradingRec.suggestedGrader}`}
                            </span>
                          </div>
                          <div className="text-right">
                            <p className="text-xs font-mono">{formatCurrency(gradingRec.estimatedCost)}</p>
                            <p className="text-xs text-muted-foreground">{gradingRec.estimatedTimeWeeks}</p>
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                          {gradingRec.graderReasoning}
                        </p>
                      </div>

                      {/* ROI projection */}
                      {gradingRec.verdict !== "Already Graded" && (
                        <div className="grid grid-cols-2 gap-2 mb-3">
                          <div className="p-2 bg-muted/30 rounded text-center">
                            <p className="text-xs text-muted-foreground">If PSA 10</p>
                            <p className="text-sm font-semibold" data-testid="text-projected-value">
                              {formatCurrency(gradingRec.projectedGradedValue)}
                            </p>
                          </div>
                          <div className="p-2 bg-muted/30 rounded text-center">
                            <p className="text-xs text-muted-foreground">Projected ROI</p>
                            <p className={`text-sm font-semibold ${gradingRec.projectedRoi >= 100 ? "text-green-600 dark:text-green-400" : gradingRec.projectedRoi >= 0 ? "text-yellow-600 dark:text-yellow-400" : "text-red-600 dark:text-red-400"}`}>
                              {gradingRec.projectedRoi >= 0 ? "+" : ""}{gradingRec.projectedRoi}%
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Reasoning bullets */}
                      <ul className="space-y-1.5 mb-3">
                        {gradingRec.reasoning?.slice(0, 4).map((r: string, i: number) => (
                          <li key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                            <Gauge className="w-3 h-3 mt-0.5 text-primary shrink-0" />
                            <span>{r}</span>
                          </li>
                        ))}
                      </ul>

                      {/* Alternative graders toggle */}
                      {gradingRec.alternativeGraders?.length > 0 && (
                        <div>
                          <button
                            className="text-xs text-primary font-medium flex items-center gap-1"
                            onClick={() => setShowGraderAlts(!showGraderAlts)}
                            data-testid="button-toggle-grader-alts"
                          >
                            {showGraderAlts ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                            {showGraderAlts ? "Hide" : "Compare"} Grading Companies
                          </button>
                          {showGraderAlts && (
                            <div className="mt-2 space-y-2">
                              {gradingRec.alternativeGraders.map((alt: any, i: number) => (
                                <div key={i} className="flex items-center justify-between p-2 bg-muted/25 rounded text-xs">
                                  <div>
                                    <p className="font-medium">{alt.name}</p>
                                    <p className="text-muted-foreground">{alt.pros}</p>
                                  </div>
                                  <p className="font-mono shrink-0 ml-2">{formatCurrency(alt.cost)}</p>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* ===== SELLING PLATFORM RECOMMENDATION ===== */}
                {sellingRec && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <ShoppingBag className="w-4 h-4 text-primary" />
                        Where to Sell
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {/* Primary platform */}
                      <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg mb-3">
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <Badge className="text-xs">
                              Best Match
                            </Badge>
                            <span className="font-semibold text-sm">{sellingRec.primary.name}</span>
                          </div>
                          <p className="text-sm font-semibold text-green-600 dark:text-green-400" data-testid="text-primary-net">
                            {formatCurrency(sellingRec.primary.netProceeds)}
                          </p>
                        </div>
                        <p className="text-xs text-muted-foreground mb-2">
                          {sellingRec.primary.fees} — Est. net proceeds
                        </p>
                        <p className="text-xs text-muted-foreground italic">
                          {sellingRec.primary.bestFor}
                        </p>
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          <div>
                            {sellingRec.primary.pros?.slice(0, 3).map((p: string, i: number) => (
                              <div key={i} className="flex items-start gap-1 text-xs text-muted-foreground mt-0.5">
                                <CheckCircle2 className="w-3 h-3 text-green-500 shrink-0 mt-0.5" />
                                <span>{p}</span>
                              </div>
                            ))}
                          </div>
                          <div>
                            {sellingRec.primary.cons?.slice(0, 3).map((c: string, i: number) => (
                              <div key={i} className="flex items-start gap-1 text-xs text-muted-foreground mt-0.5">
                                <XCircle className="w-3 h-3 text-red-400 shrink-0 mt-0.5" />
                                <span>{c}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Format & Strategy advice */}
                      <div className="space-y-2 mb-3">
                        <div className="p-2 bg-muted/30 rounded">
                          <p className="text-xs font-medium flex items-center gap-1">
                            <Zap className="w-3 h-3 text-primary" /> Listing Format
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">{sellingRec.formatAdvice}</p>
                        </div>
                        <div className="p-2 bg-muted/30 rounded">
                          <p className="text-xs font-medium flex items-center gap-1">
                            <TrendingUp className="w-3 h-3 text-primary" /> Strategy
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">{sellingRec.strategy}</p>
                        </div>
                      </div>

                      {/* Alternative platforms */}
                      {sellingRec.alternatives?.length > 0 && (
                        <div>
                          <button
                            className="text-xs text-primary font-medium flex items-center gap-1"
                            onClick={() => setShowPlatformAlts(!showPlatformAlts)}
                            data-testid="button-toggle-platform-alts"
                          >
                            {showPlatformAlts ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                            {showPlatformAlts ? "Hide" : "Compare"} {sellingRec.alternatives.length} Other Platforms
                          </button>
                          {showPlatformAlts && (
                            <div className="mt-2 space-y-2">
                              {sellingRec.alternatives.map((alt: any, i: number) => (
                                <div key={i} className="p-2 bg-muted/25 rounded">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs font-medium">{alt.name}</span>
                                      <span className="text-xs text-muted-foreground">{alt.fees}</span>
                                    </div>
                                    <p className="text-xs font-mono font-semibold">
                                      {formatCurrency(alt.netProceeds)}
                                    </p>
                                  </div>
                                  <p className="text-xs text-muted-foreground mt-0.5 italic">{alt.bestFor}</p>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}
              </>
            ) : (
              <Card>
                <CardContent className="pt-10 pb-10 text-center">
                  <Camera className="w-12 h-12 mx-auto text-muted-foreground/30 mb-4" />
                  <p className="text-sm font-medium text-foreground">
                    Upload a card photo to begin
                  </p>
                  <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">
                    AI will identify the card, auto-fill details, and calculate fair market value with full multiplier breakdown
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* Market Data Footer */}
        <div className="mt-8 border-t border-border pt-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <p className="text-xs text-muted-foreground">Market Index</p>
              <p className="text-sm font-semibold text-green-600 dark:text-green-400">CL50 +28% YTD</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground">Basketball</p>
              <p className="text-sm font-semibold text-green-600 dark:text-green-400">+43% YTD</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground">Soccer</p>
              <p className="text-sm font-semibold text-green-600 dark:text-green-400">+91% YTD</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground">Pokemon</p>
              <p className="text-sm font-semibold text-green-600 dark:text-green-400">+85% YTD</p>
            </div>
          </div>
          <p className="text-center text-xs text-muted-foreground mt-3">
            Market data from Card Ladder indices, eBay sold listings, and hobby analytics (Apr 2025–Apr 2026)
          </p>
        </div>
      </main>
    </div>
  );
}
