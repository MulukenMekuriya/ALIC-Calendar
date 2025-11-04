import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LoadingButton } from "@/components/ui/loading";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import {
  Calendar,
  Eye,
  EyeOff,
  Lock,
  CheckCircle,
  Sparkles,
} from "lucide-react";
import { z } from "zod";

const passwordSchema = z
  .string()
  .min(6, "Password must be at least 6 characters")
  .max(100, "Password too long");

const ResetPassword = () => {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordValid, setPasswordValid] = useState(false);
  const [passwordsMatch, setPasswordsMatch] = useState(false);
  const { toast } = useToast();
  const { updatePassword } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    // Check if user has a valid session with recovery token
    const hash = window.location.hash;
    if (!hash || !hash.includes("type=recovery")) {
      toast({
        title: "Invalid reset link",
        description: "Please request a new password reset link",
        variant: "destructive",
      });
      navigate("/forgot-password");
    }
  }, [navigate, toast]);

  const validatePassword = (password: string) => {
    const isValid = passwordSchema.safeParse(password).success;
    setPasswordValid(isValid);
    return isValid;
  };

  const checkPasswordsMatch = (pass: string, confirm: string) => {
    const match = pass === confirm && pass.length > 0;
    setPasswordsMatch(match);
    return match;
  };

  const getPasswordStrength = (password: string) => {
    if (password.length === 0) return { text: "", color: "" };
    if (password.length < 6)
      return { text: "Too short", color: "text-red-500" };

    let strength = 0;
    if (password.length >= 8) strength++;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) strength++;
    if (/\d/.test(password)) strength++;
    if (/[^a-zA-Z\d]/.test(password)) strength++;

    if (strength <= 1) return { text: "Weak", color: "text-orange-500" };
    if (strength <= 2) return { text: "Good", color: "text-blue-500" };
    return { text: "Strong", color: "text-green-500" };
  };

  const passwordStrength = getPasswordStrength(password);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (!validatePassword(password)) {
        toast({
          title: "Invalid password",
          description: "Password must be at least 6 characters",
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      if (!checkPasswordsMatch(password, confirmPassword)) {
        toast({
          title: "Passwords don't match",
          description: "Please make sure both passwords are the same",
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      const { error } = await updatePassword(password);

      if (error) {
        toast({
          title: "Error",
          description: error.message,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Password updated",
          description: "Your password has been successfully reset",
        });
        navigate("/dashboard");
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Something went wrong. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen">
      {/* Left side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-blue-600 via-blue-700 to-purple-800 p-12 flex-col justify-between">
        <div>
          <div className="flex items-center gap-2 text-white">
            <Calendar className="h-8 w-8" />
            <span className="text-2xl font-bold">ALIC Event Management</span>
          </div>
        </div>
        <div className="text-white">
          <h2 className="text-4xl font-bold mb-4">Set New Password</h2>
          <p className="text-blue-100 text-lg">
            Choose a strong password to secure your account.
          </p>
        </div>
        <div className="text-blue-200 text-sm">
          © 2025 ALIC Event Management. All rights reserved.
        </div>
      </div>

      {/* Right side - Form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-gray-50">
        <Card className="w-full max-w-md">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl font-bold">
              Reset Your Password
            </CardTitle>
            <CardDescription>Enter your new password below</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">New Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter new password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      validatePassword(e.target.value);
                      checkPasswordsMatch(e.target.value, confirmPassword);
                    }}
                    className="pl-10 pr-10"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-3 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                {password && (
                  <div className="flex items-center gap-2 text-sm">
                    <Sparkles className="h-3 w-3" />
                    <span className={passwordStrength.color}>
                      {passwordStrength.text}
                    </span>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm New Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input
                    id="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder="Confirm new password"
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value);
                      checkPasswordsMatch(password, e.target.value);
                    }}
                    className="pl-10 pr-10"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-3 text-gray-400 hover:text-gray-600"
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                {confirmPassword && (
                  <div className="flex items-center gap-2 text-sm">
                    {passwordsMatch ? (
                      <>
                        <CheckCircle className="h-3 w-3 text-green-500" />
                        <span className="text-green-500">Passwords match</span>
                      </>
                    ) : (
                      <>
                        <span className="text-red-500">
                          Passwords don't match
                        </span>
                      </>
                    )}
                  </div>
                )}
              </div>

              <LoadingButton
                type="submit"
                className="w-full"
                loading={loading}
                disabled={!passwordValid || !passwordsMatch}
              >
                Reset Password
              </LoadingButton>

              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => navigate("/auth")}
              >
                Back to Sign In
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ResetPassword;
