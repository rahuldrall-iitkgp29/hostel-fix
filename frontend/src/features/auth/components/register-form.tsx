"use client";

import { useState, useEffect, useCallback } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowRight, CircleAlert, RefreshCw } from "lucide-react";
import { TextField } from "@/components/ui/text-field";
import { SelectField } from "@/components/ui/select-field";
import { Button } from "@/components/ui/button";
import { StatePanel } from "@/components/feedback/state-panel";
import { useAuth } from "../context/auth-context";
import { registerSchema, type RegisterFormData } from "../schemas";
import {
  getHostels,
  getHostelBlocks,
  getRooms,
  type CatalogHostel,
  type CatalogBlock,
  type CatalogRoom,
} from "@/lib/api/catalog";
import { registerStudent } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/errors";

export function RegisterForm() {
  const { apiClient } = useAuth();
  const [serverError, setServerError] = useState<string | null>(null);
  const [registeredUser, setRegisteredUser] = useState<string | null>(null);

  // Catalogs state
  const [hostels, setHostels] = useState<CatalogHostel[]>([]);
  const [blocks, setBlocks] = useState<CatalogBlock[]>([]);
  const [rooms, setRooms] = useState<CatalogRoom[]>([]);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [loadingHostels, setLoadingHostels] = useState<boolean>(true);
  const [loadingBlocks, setLoadingBlocks] = useState<boolean>(false);
  const [loadingRooms, setLoadingRooms] = useState<boolean>(false);

  const {
    register,
    handleSubmit,
    control,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      phone: "",
      hostelId: "",
      blockId: "",
      roomId: "",
      enrollmentCode: "",
    },
  });

  const selectedHostelId = useWatch({ control, name: "hostelId" });
  const selectedBlockId = useWatch({ control, name: "blockId" });

  const fetchHostels = useCallback(() => {
    setLoadingHostels(true);
    setCatalogError(null);
    getHostels(apiClient)
      .then((data) => {
        setHostels(data);
        setLoadingHostels(false);
      })
      .catch(() => {
        setCatalogError(
          "Hostel catalogs are currently unavailable. The server may be unreachable."
        );
        setLoadingHostels(false);
      });
  }, [apiClient]);

  // Initial fetch of hostels
  useEffect(() => {
    let active = true;
    getHostels(apiClient)
      .then((data) => {
        if (active) {
          setHostels(data);
          setLoadingHostels(false);
        }
      })
      .catch(() => {
        if (active) {
          setCatalogError(
            "Hostel catalogs are currently unavailable. The server may be unreachable."
          );
          setLoadingHostels(false);
        }
      });

    return () => {
      active = false;
    };
  }, [apiClient]);

  // Async fetch blocks when hostel is selected
  useEffect(() => {
    if (!selectedHostelId) return;

    let active = true;
    getHostelBlocks(apiClient, selectedHostelId)
      .then((data) => {
        if (active) {
          setBlocks(data);
          setLoadingBlocks(false);
        }
      })
      .catch(() => {
        if (active) {
          setBlocks([]);
          setLoadingBlocks(false);
        }
      });

    return () => {
      active = false;
    };
  }, [selectedHostelId, apiClient]);

  // Async fetch rooms when block is selected
  useEffect(() => {
    if (!selectedHostelId || !selectedBlockId) return;

    let active = true;
    getRooms(apiClient, selectedHostelId, selectedBlockId)
      .then((data) => {
        if (active) {
          setRooms(data);
          setLoadingRooms(false);
        }
      })
      .catch(() => {
        if (active) {
          setRooms([]);
          setLoadingRooms(false);
        }
      });

    return () => {
      active = false;
    };
  }, [selectedHostelId, selectedBlockId, apiClient]);

  const handleHostelChange = () => {
    setValue("blockId", "");
    setValue("roomId", "");
    setBlocks([]);
    setRooms([]);
    setLoadingBlocks(true);
  };

  const handleBlockChange = () => {
    setValue("roomId", "");
    setRooms([]);
    setLoadingRooms(true);
  };

  const onSubmit = async (data: RegisterFormData) => {
    setServerError(null);
    try {
      const res = await registerStudent(apiClient, data);
      setRegisteredUser(res.user.email);
      toast.success("Account created successfully!", {
        description: "Please sign in with your email and password.",
      });
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.fields && err.fields.length > 0) {
          for (const field of err.fields) {
            const path = field.path as keyof RegisterFormData;
            if (path) {
              setError(path, { message: field.message });
            }
          }
        }
        setServerError(err.message);
      } else {
        setServerError("Registration failed. Please check your connection and try again.");
      }
    }
  };

  if (registeredUser) {
    return (
      <div className="space-y-6">
        <StatePanel
          kind="empty"
          title="Account created successfully"
          action={
            <Link
              href="/login"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand px-6 py-3 text-sm font-semibold text-white shadow-xs transition-colors hover:bg-brand-dark"
            >
              Sign in to your account <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          }
        >
          <div className="space-y-3">
            <p>
              Your student account for <strong>{registeredUser}</strong> has been registered.
            </p>
            <p className="text-xs text-muted">
              For security, new accounts require an initial sign-in. Use your registered email and password to access your hostel dashboard.
            </p>
          </div>
        </StatePanel>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
      {serverError && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-danger/20 bg-danger/5 p-4 text-sm text-danger"
        >
          <CircleAlert className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <p>{serverError}</p>
        </div>
      )}

      {catalogError && (
        <div
          role="alert"
          className="flex items-start justify-between gap-3 rounded-xl border border-warning/20 bg-warning/10 p-4 text-sm text-warning"
        >
          <div className="flex items-start gap-2">
            <CircleAlert className="mt-0.5 size-4 shrink-0" />
            <p>{catalogError}</p>
          </div>
          <button
            type="button"
            onClick={fetchHostels}
            className="flex items-center gap-1 rounded-sm text-xs font-semibold underline underline-offset-2 hover:text-ink"
          >
            <RefreshCw className="size-3" /> Retry
          </button>
        </div>
      )}

      <TextField
        id="reg-name"
        label="Full name"
        autoComplete="name"
        placeholder="Alex Sharma"
        error={errors.name?.message}
        disabled={isSubmitting}
        {...register("name")}
      />

      <TextField
        id="reg-email"
        label="Hostel email address"
        type="email"
        autoComplete="email"
        placeholder="student@hostel.edu"
        hint="Used to sign in and receive repair updates"
        error={errors.email?.message}
        disabled={isSubmitting}
        {...register("email")}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id="reg-password"
          label="Password"
          type="password"
          autoComplete="new-password"
          hint="Minimum 12 characters"
          error={errors.password?.message}
          disabled={isSubmitting}
          {...register("password")}
        />

        <TextField
          id="reg-phone"
          label="Phone number (optional)"
          type="tel"
          autoComplete="tel"
          placeholder="+919876543210"
          hint="E.164 format with country code"
          error={errors.phone?.message}
          disabled={isSubmitting}
          {...register("phone")}
        />
      </div>

      <div className="space-y-4 rounded-xl border border-line bg-canvas/60 p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">
          Your hostel allocation
        </p>

        <SelectField
          id="reg-hostel"
          label="Hostel"
          error={errors.hostelId?.message}
          disabled={isSubmitting || loadingHostels || hostels.length === 0}
          placeholder={loadingHostels ? "Loading hostels..." : "Select your hostel"}
          options={hostels.map((h) => ({ value: h.id, label: `${h.name} (${h.code})` }))}
          {...register("hostelId", { onChange: handleHostelChange })}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            id="reg-block"
            label="Block / Wing"
            error={errors.blockId?.message}
            disabled={isSubmitting || !selectedHostelId || loadingBlocks}
            placeholder={
              !selectedHostelId
                ? "Select hostel first"
                : loadingBlocks
                ? "Loading blocks..."
                : blocks.length === 0
                ? "No blocks found"
                : "Select your block"
            }
            options={blocks.map((b) => ({ value: b.id, label: `${b.name} (${b.code})` }))}
            {...register("blockId", { onChange: handleBlockChange })}
          />

          <SelectField
            id="reg-room"
            label="Room"
            error={errors.roomId?.message}
            disabled={isSubmitting || !selectedBlockId || loadingRooms}
            placeholder={
              !selectedBlockId
                ? "Select block first"
                : loadingRooms
                ? "Loading rooms..."
                : rooms.length === 0
                ? "No rooms found"
                : "Select your room"
            }
            options={rooms.map((r) => ({ value: r.id, label: `Room ${r.label}` }))}
            {...register("roomId")}
          />
        </div>

        <TextField
          id="reg-code"
          label="Hostel enrollment code"
          autoComplete="off"
          placeholder="Provided by your hostel administration"
          hint="Verification code provided by your hostel office"
          error={errors.enrollmentCode?.message}
          disabled={isSubmitting}
          {...register("enrollmentCode")}
        />
      </div>

      <Button
        type="submit"
        variant="primary"
        loading={isSubmitting}
        className="w-full justify-center text-base"
      >
        Complete student registration <ArrowRight className="size-4" aria-hidden="true" />
      </Button>
    </form>
  );
}
