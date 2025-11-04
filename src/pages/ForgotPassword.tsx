import { useState } from "react";
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
  Mail,
  CheckCircle,
  AlertCircle,
  ArrowLeft,
} from "lucide-react";
import { z } from "zod";

const ForgotPassword = () => {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [emailValid, setEmailValid] = useState(false);
  const { toast } = useToast();
  const { requestPasswordReset } = useAuth();
  const navigate = useNavigate();

  const validateEmail = (email: string) => {
    const isValid = z.string().email().safeParse(email).success;
    setEmailValid(isValid);
    return isValid;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (!validateEmail(email)) {
        toast({
          title: "Invalid email",
          description: "Please enter a valid email address",
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      const { error } = await requestPasswordReset(email);

      if (error) {
        toast({
          title: "Error",
          description: error.message,
          variant: "destructive",
        });
      } else {
        setEmailSent(true);
        toast({
          title: "Check your email",
          description: "We've sent you a password reset link",
        });
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
          <h2 className="text-4xl font-bold mb-4">Reset Your Password</h2>
          <p className="text-blue-100 text-lg">
            Enter your email address and we'll send you a link to reset your
            password.
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
            <div className="flex items-center justify-between">
              <CardTitle className="text-2xl font-bold">
                Forgot Password
              </CardTitle>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate("/auth")}
                className="h-8 w-8"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </div>
            <CardDescription>
              {emailSent
                ? "Check your email for the reset link"
                : "Enter your email to receive a password reset link"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {emailSent ? (
              <div className="space-y-4">
                <div className="flex flex-col items-center justify-center py-6 text-center">
                  <div className="rounded-full bg-green-100 p-3 mb-4">
                    <CheckCircle className="h-8 w-8 text-green-600" />
                  </div>
                  <h3 className="font-semibold text-lg mb-2">Email Sent!</h3>
                  <p className="text-sm text-gray-600 mb-4">
                    We've sent a password reset link to <strong>{email}</strong>
                  </p>
                  <p className="text-xs text-gray-500">
                    Didn't receive the email? Check your spam folder or try
                    again.
                  </p>
                </div>
                <div className="space-y-2">
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => setEmailSent(false)}
                  >
                    Try different email
                  </Button>
                  <Button
                    variant="ghost"
                    className="w-full"
                    onClick={() => navigate("/auth")}
                  >
                    Back to Sign In
                  </Button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="name@example.com"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        validateEmail(e.target.value);
                      }}
                      className="pl-10 pr-10"
                      required
                    />
                    {email && (
                      <div className="absolute right-3 top-3">
                        {emailValid ? (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        ) : (
                          <AlertCircle className="h-4 w-4 text-red-500" />
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <LoadingButton
                  type="submit"
                  className="w-full"
                  loading={loading}
                  disabled={!emailValid}
                >
                  Send Reset Link
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
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ForgotPassword;
