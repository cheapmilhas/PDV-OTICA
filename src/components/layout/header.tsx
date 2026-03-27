"use client";

import { useState, useEffect } from "react";
import { Bell, User, Building2, ChevronDown, LogOut, Loader2, Eye, EyeOff, AlertTriangle, Package, Clock, DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { MobileSidebar } from "./mobile-sidebar";
import { GlobalSearch } from "./global-search";
import { useBranchContext } from "@/hooks/use-branch-context";
import toast from "react-hot-toast";

export function Header() {
  const { data: session } = useSession();
  const router = useRouter();
  const { activeBranchId, activeBranch, branches, setActiveBranch, isAllBranches, isAdmin: isAdminUser } = useBranchContext();
  const [notifData, setNotifData] = useState<{
    osDelayed: number;
    osDelayedList: Array<{ id: string; number: number; promisedDate: string; customer: { name: string } }>;
    lowStock: number;
    shiftOpen: boolean;
    shiftHours: number;
  }>({ osDelayed: 0, osDelayedList: [], lowStock: 0, shiftOpen: false, shiftHours: 0 });
  const notifCount = notifData.osDelayed + notifData.lowStock + (notifData.shiftOpen && notifData.shiftHours >= 12 ? 1 : 0);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [errors, setErrors] = useState<{
    name?: string;
    currentPassword?: string;
    newPassword?: string;
    confirmPassword?: string;
  }>({});

  const user = {
    name: session?.user?.name || "Usuário",
    email: session?.user?.email || "",
    role: session?.user?.role || "USER",
  };

  useEffect(() => {
    if (session?.user?.name) {
      setProfileName(session.user.name);
    }
  }, [session?.user?.name]);

  const resetProfileModal = () => {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setShowCurrentPassword(false);
    setShowNewPassword(false);
    setShowConfirmPassword(false);
    setErrors({});
  };

  const handleProfileOpenChange = (open: boolean) => {
    if (!open) resetProfileModal();
    setProfileOpen(open);
  };

  const handleSaveProfile = async () => {
    const newErrors: typeof errors = {};

    if (!profileName.trim()) {
      newErrors.name = "Nome é obrigatório";
    }

    const changingPassword = currentPassword || newPassword || confirmPassword;
    if (changingPassword) {
      if (!currentPassword) {
        newErrors.currentPassword = "Informe a senha atual";
      }
      if (!newPassword) {
        newErrors.newPassword = "Informe a nova senha";
      } else if (newPassword.length < 8) {
        newErrors.newPassword = "A senha deve ter pelo menos 8 caracteres";
      }
      if (!confirmPassword) {
        newErrors.confirmPassword = "Confirme a nova senha";
      } else if (newPassword && newPassword !== confirmPassword) {
        newErrors.confirmPassword = "As senhas não coincidem";
      }
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setErrors({});
    setSavingProfile(true);
    try {
      const body: Record<string, string> = { name: profileName };
      if (changingPassword) {
        body.currentPassword = currentPassword;
        body.newPassword = newPassword;
      }

      const res = await fetch(`/api/users/${session?.user?.id}/profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        const msg = data.error?.message || "Erro ao salvar perfil";
        if (data.error?.code === "INVALID_PASSWORD") {
          setErrors({ currentPassword: "Senha atual incorreta" });
        } else {
          toast.error(msg);
        }
        return;
      }

      toast.success("Perfil atualizado com sucesso!");
      resetProfileModal();
      setProfileOpen(false);
    } catch {
      toast.error("Erro ao salvar perfil");
    } finally {
      setSavingProfile(false);
    }
  };

  useEffect(() => {
    if (!session?.user) return;
    const fetchNotifications = async () => {
      try {
        const [metricsRes, shiftRes] = await Promise.all([
          fetch("/api/dashboard/metrics"),
          fetch("/api/cash/shift"),
        ]);
        if (metricsRes.ok) {
          const m = await metricsRes.json();
          const metricsObj = m.metrics || m;
          setNotifData((prev) => ({
            ...prev,
            osDelayed: metricsObj.osDelayed || 0,
            osDelayedList: metricsObj.osDelayedList || [],
            lowStock: metricsObj.productsLowStock || 0,
          }));
        }
        if (shiftRes.ok) {
          const s = await shiftRes.json();
          if (s.shift && s.shift.status === "OPEN") {
            const hours = (Date.now() - new Date(s.shift.openedAt).getTime()) / (1000 * 60 * 60);
            setNotifData((prev) => ({ ...prev, shiftOpen: true, shiftHours: hours }));
          }
        }
      } catch {
        // Silencioso
      }
    };
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [session]);

  return (
    <>
    <header className="flex h-[60px] items-center justify-between border-b bg-background/95 backdrop-blur-sm px-4 md:px-5 sticky top-0 z-30">
      {/* Mobile menu button */}
      <MobileSidebar />

      {/* Search */}
      <div className="hidden sm:flex flex-1 items-center gap-4 max-w-sm">
        <GlobalSearch />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5 md:gap-2">
        {/* Branch Selector */}
        {branches.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="hidden md:flex gap-1.5 h-8 text-xs">
                <Building2 className="h-3.5 w-3.5" />
                <span className="max-w-[120px] truncate">
                  {isAllBranches ? "Todas as Lojas" : activeBranch?.name || "Selecionar"}
                </span>
                {branches.length > 1 && <ChevronDown className="h-3 w-3 text-muted-foreground" />}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel className="text-xs">Selecionar Filial</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {isAdminUser && (
                <>
                  <DropdownMenuItem
                    onClick={() => setActiveBranch("ALL")}
                    className={isAllBranches ? "bg-accent" : ""}
                  >
                    <Building2 className="mr-2 h-3.5 w-3.5 text-primary" />
                    <span className="font-medium text-sm">Todas as Lojas</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              {branches.map((branch) => (
                <DropdownMenuItem
                  key={branch.id}
                  onClick={() => setActiveBranch(branch.id)}
                  className={activeBranchId === branch.id ? "bg-accent" : ""}
                >
                  <Building2 className="mr-2 h-3.5 w-3.5" />
                  <span className="text-sm">{branch.name}</span>
                  {branch.city && (
                    <span className="ml-auto text-xs text-muted-foreground">{branch.city}</span>
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {/* Notifications */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="relative h-8 w-8">
              <Bell className="h-4 w-4" />
              {notifCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-destructive-foreground ring-2 ring-background">
                  {notifCount}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-0 shadow-elevated">
            <div className="px-4 py-3 border-b">
              <p className="text-sm font-semibold">Notificações</p>
              {notifCount > 0 && (
                <p className="text-xs text-muted-foreground mt-0.5">{notifCount} item{notifCount > 1 ? "s" : ""} pendente{notifCount > 1 ? "s" : ""}</p>
              )}
            </div>
            <div className="max-h-72 overflow-y-auto">
              {notifCount === 0 ? (
                <div className="flex flex-col items-center py-8 gap-2">
                  <Bell className="h-8 w-8 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">Tudo em dia</p>
                </div>
              ) : (
                <div className="divide-y">
                  {notifData.osDelayed > 0 && (
                    <>
                      <button
                        className="flex items-start gap-3 w-full px-4 py-3 text-left hover:bg-muted/50 transition-colors duration-150"
                        onClick={() => router.push("/dashboard/ordens-servico?filter=atrasadas")}
                      >
                        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-destructive/10">
                          <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{notifData.osDelayed} OS atrasada{notifData.osDelayed > 1 ? "s" : ""}</p>
                          <p className="text-xs text-muted-foreground">Clique para ver todas</p>
                        </div>
                      </button>
                      {notifData.osDelayedList.slice(0, 2).map((os) => (
                        <button
                          key={os.id}
                          className="flex items-center gap-3 w-full px-4 py-2.5 text-left hover:bg-muted/50 transition-colors duration-150 pl-14"
                          onClick={() => router.push(`/dashboard/ordens-servico?filter=atrasadas`)}
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-foreground">OS #{String(os.number).padStart(5, "0")}</p>
                            <p className="text-xs text-muted-foreground truncate">{os.customer?.name || "Cliente"}</p>
                          </div>
                        </button>
                      ))}
                    </>
                  )}
                  {notifData.lowStock > 0 && (
                    <button
                      className="flex items-start gap-3 w-full px-4 py-3 text-left hover:bg-muted/50 transition-colors duration-150"
                      onClick={() => router.push("/dashboard/estoque")}
                    >
                      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-warning/10">
                        <Package className="h-3.5 w-3.5 text-warning" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{notifData.lowStock} produto{notifData.lowStock > 1 ? "s" : ""} com estoque baixo</p>
                        <p className="text-xs text-muted-foreground">Abaixo do estoque mínimo</p>
                      </div>
                    </button>
                  )}
                  {notifData.shiftOpen && notifData.shiftHours >= 12 && (
                    <button
                      className="flex items-start gap-3 w-full px-4 py-3 text-left hover:bg-muted/50 transition-colors duration-150"
                      onClick={() => router.push("/dashboard/caixa")}
                    >
                      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-warning/10">
                        <Clock className="h-3.5 w-3.5 text-warning" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">Caixa aberto há {Math.floor(notifData.shiftHours)}h</p>
                        <p className="text-xs text-muted-foreground">Considere fechar o caixa</p>
                      </div>
                    </button>
                  )}
                </div>
              )}
            </div>
            <Separator />
            <button
              className="w-full px-4 py-2.5 text-xs text-center text-primary hover:bg-muted/50 transition-colors duration-150 font-medium"
              onClick={() => router.push("/dashboard/lembretes")}
            >
              Ver todos os lembretes →
            </button>
          </PopoverContent>
        </Popover>

        {/* User Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-2 h-8 px-2">
              <Avatar className="h-6 w-6">
                <AvatarFallback className="bg-primary text-primary-foreground text-xs font-semibold">
                  {user.name.charAt(0)}
                </AvatarFallback>
              </Avatar>
              <span className="hidden md:inline-block text-sm font-medium max-w-[120px] truncate">{user.name}</span>
              <ChevronDown className="hidden md:block h-3 w-3 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 shadow-elevated">
            <DropdownMenuLabel>
              <div className="flex flex-col gap-0.5">
                <p className="text-sm font-semibold">{user.name}</p>
                <p className="text-xs text-muted-foreground font-normal">{user.email}</p>
                <Badge variant="secondary" className="w-fit text-xs mt-1">
                  {user.role}
                </Badge>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setProfileOpen(true)} className="text-sm">
              <User className="mr-2 h-3.5 w-3.5" />
              Meu Perfil
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push("/dashboard/lembretes")} className="text-sm">
              <Bell className="mr-2 h-3.5 w-3.5" />
              Notificações
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive text-sm"
              onClick={() => signOut({ callbackUrl: "/" })}
            >
              <LogOut className="mr-2 h-3.5 w-3.5" />
              Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>

    {/* Modal Meu Perfil */}
    <Dialog open={profileOpen} onOpenChange={handleProfileOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Meu Perfil</DialogTitle>
          <DialogDescription>Atualize seus dados e senha de acesso</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Info do usuário */}
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border border-border">
            <Avatar className="h-11 w-11">
              <AvatarFallback className="bg-primary text-primary-foreground text-base font-semibold">
                {user.name.charAt(0)}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="font-semibold text-sm">{user.name}</p>
              <p className="text-xs text-muted-foreground">{user.email}</p>
              <Badge variant="secondary" className="text-xs mt-1">{user.role}</Badge>
            </div>
          </div>

          {/* Nome */}
          <div className="space-y-1.5">
            <Label htmlFor="profile-name" className="text-sm font-medium">Nome</Label>
            <Input
              id="profile-name"
              value={profileName}
              onChange={(e) => { setProfileName(e.target.value); setErrors(p => ({ ...p, name: undefined })); }}
              placeholder="Seu nome"
              className={errors.name ? "border-destructive focus-visible:ring-destructive" : ""}
            />
            {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
          </div>

          {/* Separador senha */}
          <div className="pt-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Alterar Senha <span className="font-normal normal-case tracking-normal">(opcional)</span>
            </p>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="current-password" className="text-sm font-medium">Senha atual</Label>
                <div className="relative">
                  <Input
                    id="current-password"
                    type={showCurrentPassword ? "text" : "password"}
                    value={currentPassword}
                    onChange={(e) => { setCurrentPassword(e.target.value); setErrors(p => ({ ...p, currentPassword: undefined })); }}
                    placeholder="Digite a senha atual"
                    className={errors.currentPassword ? "border-destructive focus-visible:ring-destructive pr-10" : "pr-10"}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="absolute right-1.5 top-1/2 -translate-y-1/2"
                    onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  >
                    {showCurrentPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </Button>
                </div>
                {errors.currentPassword && <p className="text-xs text-destructive">{errors.currentPassword}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="new-password" className="text-sm font-medium">Nova senha</Label>
                <div className="relative">
                  <Input
                    id="new-password"
                    type={showNewPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => { setNewPassword(e.target.value); setErrors(p => ({ ...p, newPassword: undefined })); }}
                    placeholder="Mínimo 8 caracteres"
                    className={errors.newPassword ? "border-destructive focus-visible:ring-destructive pr-10" : "pr-10"}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="absolute right-1.5 top-1/2 -translate-y-1/2"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                  >
                    {showNewPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </Button>
                </div>
                {errors.newPassword && <p className="text-xs text-destructive">{errors.newPassword}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="confirm-password" className="text-sm font-medium">Confirmar nova senha</Label>
                <div className="relative">
                  <Input
                    id="confirm-password"
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => { setConfirmPassword(e.target.value); setErrors(p => ({ ...p, confirmPassword: undefined })); }}
                    placeholder="Repita a nova senha"
                    className={errors.confirmPassword ? "border-destructive focus-visible:ring-destructive pr-10" : "pr-10"}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="absolute right-1.5 top-1/2 -translate-y-1/2"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  >
                    {showConfirmPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </Button>
                </div>
                {errors.confirmPassword && <p className="text-xs text-destructive">{errors.confirmPassword}</p>}
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button variant="outline" size="sm" onClick={() => handleProfileOpenChange(false)} disabled={savingProfile}>
            Cancelar
          </Button>
          <Button size="sm" onClick={handleSaveProfile} disabled={savingProfile}>
            {savingProfile && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
            Salvar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}
