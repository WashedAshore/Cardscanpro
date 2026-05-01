import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { User } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Loader2, LogIn, UserPlus, AlertCircle } from "lucide-react";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuth: (user: User) => void;
  mode?: "login" | "register";
}

interface AuthResponse {
  user: User;
}

export function AuthModal({ isOpen, onClose, onAuth, mode = "login" }: AuthModalProps) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"login" | "register">(mode);

  // Login state
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");

  // Register state
  const [regUsername, setRegUsername] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regError, setRegError] = useState("");

  const resetState = () => {
    setLoginUsername("");
    setLoginPassword("");
    setLoginError("");
    setRegUsername("");
    setRegPassword("");
    setRegEmail("");
    setRegError("");
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const loginMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/auth/login", {
        username: loginUsername.trim(),
        password: loginPassword,
      });
      return res.json() as Promise<AuthResponse>;
    },
    onSuccess: (data) => {
      toast({ title: "Welcome back!", description: `Logged in as ${data.user.username}` });
      onAuth(data.user);
      handleClose();
    },
    onError: (err: Error) => {
      setLoginError(err.message.replace(/^\d+:\s*/, ""));
    },
  });

  const registerMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/auth/register", {
        username: regUsername.trim(),
        password: regPassword,
        email: regEmail.trim() || undefined,
      });
      return res.json() as Promise<AuthResponse>;
    },
    onSuccess: (data) => {
      toast({ title: "Account created!", description: `Welcome, ${data.user.username}!` });
      onAuth(data.user);
      handleClose();
    },
    onError: (err: Error) => {
      setRegError(err.message.replace(/^\d+:\s*/, ""));
    },
  });

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    if (!loginUsername.trim() || !loginPassword) {
      setLoginError("Username and password are required.");
      return;
    }
    loginMutation.mutate();
  };

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    setRegError("");
    if (!regUsername.trim() || !regPassword) {
      setRegError("Username and password are required.");
      return;
    }
    if (regPassword.length < 6) {
      setRegError("Password must be at least 6 characters.");
      return;
    }
    registerMutation.mutate();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-sm" data-testid="auth-modal">
        <DialogHeader>
          <DialogTitle className="text-lg">
            {activeTab === "login" ? "Sign In" : "Create Account"}
          </DialogTitle>
          <DialogDescription>
            {activeTab === "login"
              ? "Log in to access your card history, folders, and subscription."
              : "Create a free account to start scanning cards."}
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={activeTab}
          onValueChange={(v) => {
            setActiveTab(v as "login" | "register");
            setLoginError("");
            setRegError("");
          }}
        >
          <TabsList className="w-full mb-4">
            <TabsTrigger value="login" className="flex-1" data-testid="tab-login">
              Login
            </TabsTrigger>
            <TabsTrigger value="register" className="flex-1" data-testid="tab-register">
              Register
            </TabsTrigger>
          </TabsList>

          {/* Login Tab */}
          <TabsContent value="login">
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="login-username" className="text-sm">Username</Label>
                <Input
                  id="login-username"
                  placeholder="Your username"
                  value={loginUsername}
                  onChange={(e) => setLoginUsername(e.target.value)}
                  autoComplete="username"
                  data-testid="input-login-username"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="login-password" className="text-sm">Password</Label>
                <Input
                  id="login-password"
                  type="password"
                  placeholder="Your password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  autoComplete="current-password"
                  data-testid="input-login-password"
                />
              </div>

              {loginError && (
                <div className="flex items-start gap-2 rounded-md bg-destructive/10 text-destructive px-3 py-2 text-xs" data-testid="text-login-error">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>{loginError}</span>
                </div>
              )}

              <Button
                type="submit"
                className="w-full"
                disabled={loginMutation.isPending}
                data-testid="button-login-submit"
              >
                {loginMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Logging in…
                  </>
                ) : (
                  <>
                    <LogIn className="w-4 h-4 mr-2" />
                    Log In
                  </>
                )}
              </Button>
            </form>
          </TabsContent>

          {/* Register Tab */}
          <TabsContent value="register">
            <form onSubmit={handleRegister} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="reg-username" className="text-sm">Username</Label>
                <Input
                  id="reg-username"
                  placeholder="Choose a username"
                  value={regUsername}
                  onChange={(e) => setRegUsername(e.target.value)}
                  autoComplete="username"
                  data-testid="input-reg-username"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reg-email" className="text-sm">
                  Email <span className="text-muted-foreground text-xs">(optional)</span>
                </Label>
                <Input
                  id="reg-email"
                  type="email"
                  placeholder="you@example.com"
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  autoComplete="email"
                  data-testid="input-reg-email"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reg-password" className="text-sm">Password</Label>
                <Input
                  id="reg-password"
                  type="password"
                  placeholder="Min. 6 characters"
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  autoComplete="new-password"
                  data-testid="input-reg-password"
                />
              </div>

              {regError && (
                <div className="flex items-start gap-2 rounded-md bg-destructive/10 text-destructive px-3 py-2 text-xs" data-testid="text-reg-error">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>{regError}</span>
                </div>
              )}

              <Button
                type="submit"
                className="w-full"
                disabled={registerMutation.isPending}
                data-testid="button-register-submit"
              >
                {registerMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Creating account…
                  </>
                ) : (
                  <>
                    <UserPlus className="w-4 h-4 mr-2" />
                    Create Account
                  </>
                )}
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
