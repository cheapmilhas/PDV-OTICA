"use client";

import { useState, useEffect } from "react";
import { Bell, Search, User, Building2, ChevronDown, LogOut, Loader2, Eye, EyeOff } from "lucide-react";
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
import { MobileSidebar } from "./mobile-sidebar";
import toast from "react-hot-toast";

interface Branch {
  id: string;
  name: string;
  code: string;
  city?: string;
  state?: string;
}

export function Header() {
  const { data: session } = useSession();
  const router = useRouter();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);
  const [notifications] = useState(0);
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

  // Inicializar nome do perfil quando a sessão carregar
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

    // Se qualquer campo de senha foi preenchido, valida todos
    const changingPassword = currentPassword || newPassword || confirmPassword;
    if (changingPassword) {
      if (!currentPassword) {
        newErrors.currentPassword = "Informe a senha atual";
      }
      if (!newPassword) {
        newErrors.newPassword = "Informe a nova senha";
      } else if (newPassword.length < 6) {
        newErrors.newPassword = "A senha deve ter pelo menos 6 caracteres";
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
        // Erros específicos de senha voltam para o campo correto
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

  // Carregar filiais da empresa
  useEffect(() => {
    async function loadBranches() {
      try {
        const response = await fetch("/api/branches");
        if (response.ok) {
          const result = await response.json();
          const branchesData = result.data || [];
          setBranches(branchesData);

          // Selecionar a filial do usuário logado ou a primeira disponível
          if (branchesData.length > 0) {
            const userBranchId = session?.user?.branchId;
            const userBranch = branchesData.find((b: Branch) => b.id === userBranchId);
            setSelectedBranch(userBranch || branchesData[0]);
          }
        }
      } catch (error) {
        console.error("Erro ao carregar filiais:", error);
      }
    }

    if (session?.user) {
      loadBranches();
    }
  }, [session]);

  return (
    <>
    <header className="flex h-14 md:h-16 items-center justify-between border-b bg-background px-4 md:px-6">
      {/* Mobile menu button */}
      <MobileSidebar />

      {/* Search - esconde em mobile */}
      <div className="hidden sm:flex flex-1 items-center gap-4 max-w-md">
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Buscar produtos, clientes..."
            className="pl-10"
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 md:gap-4">
        {/* Branch Selector */}
        {selectedBranch && branches.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="hidden md:flex gap-2">
                <Building2 className="h-4 w-4" />
                <span className="max-w-[150px] truncate">{selectedBranch.name}</span>
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Selecionar Filial</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {branches.map((branch) => (
                <DropdownMenuItem
                  key={branch.id}
                  onClick={() => setSelectedBranch(branch)}
                  className={selectedBranch.id === branch.id ? "bg-accent" : ""}
                >
                  <Building2 className="mr-2 h-4 w-4" />
                  {branch.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {/* Notifications */}
        <Button variant="ghost" size="icon" className="relative" onClick={() => router.push("/dashboard/lembretes")}>
          <Bell className="h-5 w-5" />
          {notifications > 0 && (
            <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
              {notifications}
            </span>
          )}
        </Button>

        {/* User Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="gap-2">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-primary text-primary-foreground text-sm">
                  {user.name.charAt(0)}
                </AvatarFallback>
              </Avatar>
              <span className="hidden md:inline-block">{user.name}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium">{user.name}</p>
                <p className="text-xs text-muted-foreground">{user.email}</p>
                <Badge variant="secondary" className="w-fit text-xs">
                  {user.role}
                </Badge>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setProfileOpen(true)}>
              <User className="mr-2 h-4 w-4" />
              Meu Perfil
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push("/dashboard/lembretes")}>
              <Bell className="mr-2 h-4 w-4" />
              Notificações
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive"
              onClick={() => signOut({ callbackUrl: "/" })}
            >
              <LogOut className="mr-2 h-4 w-4" />
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
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted">
            <Avatar className="h-12 w-12">
              <AvatarFallback className="bg-primary text-primary-foreground text-lg">
                {user.name.charAt(0)}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="font-medium">{user.name}</p>
              <p className="text-sm text-muted-foreground">{user.email}</p>
              <Badge variant="secondary" className="text-xs mt-1">{user.role}</Badge>
            </div>
          </div>

          {/* Nome */}
          <div className="space-y-1.5">
            <Label htmlFor="profile-name">Nome</Label>
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
          <div className="pt-2">
            <p className="text-sm font-medium text-muted-foreground mb-3">Alterar Senha <span className="font-normal">(opcional)</span></p>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="current-password">Senha atual</Label>
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
                    size="icon"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                    onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  >
                    {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                {errors.currentPassword && <p className="text-xs text-destructive">{errors.currentPassword}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="new-password">Nova senha</Label>
                <div className="relative">
                  <Input
                    id="new-password"
                    type={showNewPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => { setNewPassword(e.target.value); setErrors(p => ({ ...p, newPassword: undefined })); }}
                    placeholder="Mínimo 6 caracteres"
                    className={errors.newPassword ? "border-destructive focus-visible:ring-destructive pr-10" : "pr-10"}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                  >
                    {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                {errors.newPassword && <p className="text-xs text-destructive">{errors.newPassword}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="confirm-password">Confirmar nova senha</Label>
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
                    size="icon"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                {errors.confirmPassword && <p className="text-xs text-destructive">{errors.confirmPassword}</p>}
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => handleProfileOpenChange(false)} disabled={savingProfile}>
            Cancelar
          </Button>
          <Button onClick={handleSaveProfile} disabled={savingProfile}>
            {savingProfile && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}
