"use client";

/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MEMBER_GENDERS,
  MEMBER_POSITIONS,
  MEMBER_STATUSES,
  THAI_BANKS,
  THAI_PROVINCES,
} from "@/lib/memberOptions";
import { getBrandChromeStyles } from "@/app/lib/brandThemes";
import { safeGetObject } from "@/app/lib/safeStorage";

const DEFAULT_FORM = {
  profileImageUrl: "",
  firstName: "",
  lastName: "",
  nickname: "",
  birthDate: "",
  gender: "",
  genderOther: "",
  phone: "",
  email: "",
  lineId: "",
  facebook: "",
  emergencyContactName: "",
  emergencyContactRelationship: "",
  emergencyContactPhone: "",
  addressHouseNumber: "",
  addressBuildingVillage: "",
  addressMoo: "",
  addressSoi: "",
  addressRoad: "",
  addressSubdistrict: "",
  addressDistrict: "",
  addressProvince: "",
  addressPostalCode: "",
  bankName: "",
  bankNameOther: "",
  bankAccountName: "",
  bankAccountNumber: "",
  position: "",
  positionOther: "",
  status: "ทดลองงาน",
  notes: "",
};

const SORT_OPTIONS = [
  ["newest", "วันที่เพิ่มล่าสุด"],
  ["code_desc", "รหัสสมาชิกล่าสุด"],
  ["code_asc", "รหัสสมาชิกเก่าสุด"],
  ["name_asc", "ชื่อ ก-ฮ"],
  ["name_desc", "ชื่อ ฮ-ก"],
  ["birthday", "วันเกิดใกล้ถึง"],
];

const EMAIL_PATTERN = /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/;
const PHONE_PATTERN = /^[0-9+\-\s().]{8,20}$/;
const FORM_FIELD_ORDER = [
  "firstName",
  "lastName",
  "birthDate",
  "phone",
  "email",
  "emergencyContactPhone",
  "addressPostalCode",
  "bankNameOther",
  "position",
  "positionOther",
  "status",
];

const Icon = ({ name, className = "h-5 w-5" }) => {
  const paths = {
    plus: (
      <>
        <path d="M12 5v14" />
        <path d="M5 12h14" />
      </>
    ),
    search: (
      <>
        <path d="m21 21-4.3-4.3" />
        <circle cx="11" cy="11" r="7" />
      </>
    ),
    trash: (
      <>
        <path d="M4 7h16" />
        <path d="M10 11v6" />
        <path d="M14 11v6" />
        <path d="M6 7l1 14h10l1-14" />
        <path d="M9 7V4h6v3" />
      </>
    ),
    eye: (
      <>
        <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
    edit: (
      <>
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
      </>
    ),
    phone: (
      <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.8a2 2 0 0 1-.4 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z" />
    ),
    mail: (
      <>
        <path d="M4 6h16v12H4z" />
        <path d="m4 7 8 6 8-6" />
      </>
    ),
    copy: (
      <>
        <rect x="9" y="9" width="13" height="13" rx="2" />
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
      </>
    ),
    restore: (
      <>
        <path d="M3 12a9 9 0 1 0 3-6.7" />
        <path d="M3 4v6h6" />
      </>
    ),
    close: (
      <>
        <path d="m6 6 12 12" />
        <path d="m18 6-12 12" />
      </>
    ),
    user: (
      <>
        <path d="M16 11a4 4 0 1 0-8 0 4 4 0 0 0 8 0Z" />
        <path d="M4.5 21a7.5 7.5 0 0 1 15 0" />
      </>
    ),
    map: (
      <>
        <path d="M12 21s7-5.3 7-12a7 7 0 0 0-14 0c0 6.7 7 12 7 12Z" />
        <circle cx="12" cy="9" r="2.5" />
      </>
    ),
    bank: (
      <>
        <path d="M3 10h18" />
        <path d="M5 10v8" />
        <path d="M9 10v8" />
        <path d="M15 10v8" />
        <path d="M19 10v8" />
        <path d="M4 18h16" />
        <path d="M12 3 4 8h16Z" />
      </>
    ),
    briefcase: (
      <>
        <rect x="3" y="7" width="18" height="13" rx="2" />
        <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        <path d="M3 12h18" />
      </>
    ),
    note: (
      <>
        <path d="M7 3h8l4 4v14H7z" />
        <path d="M15 3v5h5" />
        <path d="M10 13h6" />
        <path d="M10 17h4" />
      </>
    ),
  };

  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
};

const formatDate = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

const calculateAge = (value) => {
  if (!value) return "-";
  const birthDate = new Date(`${value}T00:00:00`);
  if (Number.isNaN(birthDate.getTime())) return "-";
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDelta = today.getMonth() - birthDate.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < birthDate.getDate())) {
    age -= 1;
  }
  return age >= 0 ? `${age} ปี` : "-";
};

const getStatusClassName = (status) => {
  if (status === "ปกติ") return "border-green-200 bg-green-50 text-green-700";
  if (status === "ทดลองงาน") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "พักงานชั่วคราว") return "border-orange-200 bg-orange-50 text-orange-700";
  if (status === "ระงับสมาชิก") return "border-red-200 bg-red-50 text-red-700";
  return "border-zinc-200 bg-zinc-100 text-zinc-600";
};

const getInitials = (member) =>
  `${member?.firstName?.[0] || ""}${member?.lastName?.[0] || ""}` || "MB";

const buildLineUrl = (lineId) => {
  const value = String(lineId || "").replace(/^@/, "").trim();
  return value ? `https://line.me/R/ti/p/~${encodeURIComponent(value)}` : "";
};

const buildFacebookUrl = (facebook) => {
  const value = String(facebook || "").trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  return `https://facebook.com/${encodeURIComponent(value)}`;
};

const compressImageFile = async (file) => {
  if (!file || typeof window === "undefined") return null;
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new Error("รองรับเฉพาะ JPG, PNG และ WebP");
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error("รูปโปรไฟล์ต้องมีขนาดไม่เกิน 5 MB");
  }

  const bitmap = await createImageBitmap(file);
  const maxSide = 960;
  const ratio = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * ratio));
  const height = Math.max(1, Math.round(bitmap.height * ratio));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  const type = file.type === "image/png" ? "image/png" : "image/webp";
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, type, 0.82));
  if (!blob) throw new Error("ไม่สามารถเตรียมรูปโปรไฟล์ได้");
  return new File([blob], file.name.replace(/\.[^.]+$/, type === "image/webp" ? ".webp" : ".png"), {
    type,
  });
};

const validateMemberForm = (form) => {
  const errors = {};
  const today = new Date().toISOString().slice(0, 10);

  if (!String(form.firstName || "").trim()) {
    errors.firstName = "กรุณากรอกชื่อ";
  }
  if (!String(form.lastName || "").trim()) {
    errors.lastName = "กรุณากรอกนามสกุล";
  }
  if (form.birthDate && form.birthDate > today) {
    errors.birthDate = "วันเกิดห้ามเป็นวันที่ในอนาคต";
  }
  if (form.phone && !PHONE_PATTERN.test(form.phone)) {
    errors.phone = "เบอร์โทรศัพท์ไม่ถูกต้อง";
  }
  if (form.email && !EMAIL_PATTERN.test(form.email)) {
    errors.email = "อีเมลไม่ถูกต้อง";
  }
  if (form.emergencyContactPhone && !PHONE_PATTERN.test(form.emergencyContactPhone)) {
    errors.emergencyContactPhone = "เบอร์ผู้ติดต่อฉุกเฉินไม่ถูกต้อง";
  }
  if (form.addressPostalCode && !/^\d{5}$/.test(form.addressPostalCode)) {
    errors.addressPostalCode = "รหัสไปรษณีย์ต้องเป็นตัวเลข 5 หลัก";
  }
  if (form.bankName === "อื่นๆ" && !String(form.bankNameOther || "").trim()) {
    errors.bankNameOther = "กรุณาระบุชื่อธนาคาร";
  }
  if (!String(form.position || "").trim()) {
    errors.position = "กรุณาเลือกตำแหน่ง";
  }
  if (form.position === "อื่นๆ" && !String(form.positionOther || "").trim()) {
    errors.positionOther = "กรุณาระบุตำแหน่ง";
  }
  if (!form.status) {
    errors.status = "กรุณาเลือกสถานะสมาชิก";
  }

  return errors;
};

const Field = ({ label, children, required, error, className = "" }) => (
  <label className={`block ${className}`}>
    <span className="mb-1.5 block text-[13px] font-bold text-zinc-700">
      {label}
      {required && <span className="text-red-500"> *</span>}
    </span>
    {children}
    {error && <span className="mt-1 block text-xs font-bold text-red-600">{error}</span>}
  </label>
);

const inputClassName = (error, className = "") =>
  `h-[46px] w-full rounded-xl border bg-white px-3.5 text-sm font-semibold text-zinc-800 outline-none transition focus:border-[var(--brand-accent)] focus:ring-4 focus:ring-amber-100 disabled:bg-zinc-50 max-md:h-12 max-md:text-base ${
    error ? "border-red-400 focus:border-red-500 focus:ring-red-100" : "border-zinc-200"
  } ${className}`;

const TextInput = ({ className = "", error, inputRef, ...props }) => (
  <input
    {...props}
    ref={inputRef}
    aria-invalid={error ? "true" : undefined}
    className={inputClassName(error, className)}
  />
);

const SelectInput = ({ children, className = "", error, inputRef, ...props }) => (
  <select
    {...props}
    ref={inputRef}
    aria-invalid={error ? "true" : undefined}
    className={inputClassName(error, className)}
  >
    {children}
  </select>
);

const Section = ({
  title,
  children,
  icon = "note",
  gridClassName = "grid gap-3 md:grid-cols-2",
  className = "",
}) => (
  <section className={`rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm ${className}`}>
    <h3 className="flex items-center gap-2 text-[15px] font-black text-zinc-900">
      <span
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
        style={{
          backgroundColor: "var(--brand-accent-soft)",
          color: "var(--brand-primary)",
        }}
      >
        <Icon name={icon} className="h-4 w-4" />
      </span>
      {title}
    </h3>
    <div className={`mt-3.5 ${gridClassName}`}>{children}</div>
  </section>
);

const Avatar = ({ member, size = "h-11 w-11" }) => {
  if (member?.profileImageUrl) {
    return (
      <img
        src={member.profileImageUrl}
        alt={member.fullName || member.memberCode || "Member"}
        width="56"
        height="56"
        loading="lazy"
        className={`${size} shrink-0 rounded-2xl object-cover`}
      />
    );
  }

  return (
    <div
      className={`${size} flex shrink-0 items-center justify-center rounded-2xl text-sm font-black`}
      style={{
        backgroundColor: "var(--brand-accent-soft)",
        color: "var(--brand-primary)",
      }}
    >
      {getInitials(member)}
    </div>
  );
};

export default function BrandMembersPage({ brandId }) {
  const brandChrome = getBrandChromeStyles(brandId);
  const [members, setMembers] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [sort, setSort] = useState("newest");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({
    brand: brandId,
    position: "",
    status: "",
    gender: "",
    province: "",
  });
  const [trashMode, setTrashMode] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isAdmin] = useState(() => {
    if (typeof window === "undefined") return false;
    const currentUser = safeGetObject("currentUser", {
      storage: "session",
      maxBytes: 64 * 1024,
    });
    return currentUser?.role === "ADMIN" || currentUser?.role === "super_admin";
  });
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState("create");
  const [form, setForm] = useState(DEFAULT_FORM);
  const [formErrors, setFormErrors] = useState({});
  const [editingMember, setEditingMember] = useState(null);
  const [selectedMember, setSelectedMember] = useState(null);
  const [bankVisible, setBankVisible] = useState(false);
  const [pendingImageFile, setPendingImageFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [pendingActionId, setPendingActionId] = useState("");
  const previewUrlRef = useRef("");
  const formFieldRefs = useRef({});

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const canGoPrev = page > 0;
  const canGoNext = page + 1 < totalPages;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(0);
    }, 320);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const loadMembers = useCallback(
    async (signal) => {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        sort,
        trash: trashMode ? "1" : "0",
      });

      const activeBrand = isAdmin ? filters.brand : brandId;
      if (activeBrand && activeBrand !== "all") params.set("brand", activeBrand);
      if (search) params.set("search", search);
      if (filters.position) params.set("position", filters.position);
      if (filters.status) params.set("status", filters.status);
      if (filters.gender) params.set("gender", filters.gender);
      if (filters.province) params.set("province", filters.province);

      setIsLoading(true);
      setError("");
      const response = await fetch(`/api/members?${params.toString()}`, {
        cache: "no-store",
        signal,
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) {
        throw new Error(result.error || "โหลดข้อมูลสมาชิกไม่สำเร็จ");
      }
      setMembers(Array.isArray(result.members) ? result.members : []);
      setTotal(Number(result.total || 0));
      setIsLoading(false);
    },
    [brandId, filters, isAdmin, page, pageSize, search, sort, trashMode]
  );

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      loadMembers(controller.signal).catch((loadError) => {
        if (controller.signal.aborted) return;
        setError(loadError?.message || "โหลดข้อมูลสมาชิกไม่สำเร็จ");
        setIsLoading(false);
      });
    }, 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [loadMembers]);

  useEffect(
    () => () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    },
    []
  );

  const setFormValue = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
    setFormErrors((current) => {
      if (!current[key]) return current;
      const nextErrors = { ...current };
      delete nextErrors[key];
      return nextErrors;
    });
  };

  const resetImagePreview = () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = "";
    setPreviewUrl("");
    setPendingImageFile(null);
  };

  const openCreateForm = () => {
    resetImagePreview();
    setEditingMember(null);
    setForm(DEFAULT_FORM);
    setFormErrors({});
    setFormMode("create");
    setFormOpen(true);
    setError("");
  };

  const fetchMemberDetail = async (member) => {
    const response = await fetch(`/api/members/${member.id}`, { cache: "no-store" });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.success) {
      throw new Error(result.error || "โหลดรายละเอียดสมาชิกไม่สำเร็จ");
    }
    return result.member;
  };

  const openDetail = async (member) => {
    setPendingActionId(`detail:${member.id}`);
    setError("");
    try {
      const detail = await fetchMemberDetail(member);
      setSelectedMember(detail);
      setBankVisible(false);
    } catch (detailError) {
      setError(detailError?.message || "โหลดรายละเอียดสมาชิกไม่สำเร็จ");
    } finally {
      setPendingActionId("");
    }
  };

  const openEditForm = async (member) => {
    setPendingActionId(`edit:${member.id}`);
    setError("");
    try {
      const detail = await fetchMemberDetail(member);
      resetImagePreview();
      setEditingMember(detail);
      setForm({ ...DEFAULT_FORM, ...detail });
      setFormErrors({});
      setFormMode("edit");
      setFormOpen(true);
      setSelectedMember(null);
    } catch (detailError) {
      setError(detailError?.message || "โหลดข้อมูลแก้ไขไม่สำเร็จ");
    } finally {
      setPendingActionId("");
    }
  };

  const refreshAfterAction = async () => {
    await loadMembers();
  };

  const uploadPendingImage = async (memberId = "new") => {
    if (!pendingImageFile) return form.profileImageUrl || "";

    const formData = new FormData();
    formData.set("file", pendingImageFile);
    formData.set("brand", isAdmin && filters.brand !== "all" ? filters.brand : brandId);
    formData.set("memberId", memberId);

    const response = await fetch("/api/members/upload", {
      method: "POST",
      body: formData,
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.success) {
      throw new Error(result.error || "อัปโหลดรูปโปรไฟล์ไม่สำเร็จ");
    }
    return result.url || "";
  };

  const saveMember = async (event) => {
    event.preventDefault();
    if (isSaving) return;

    const nextFormErrors = validateMemberForm(form);
    const firstErrorKey = FORM_FIELD_ORDER.find((key) => nextFormErrors[key]);

    if (firstErrorKey) {
      setFormErrors(nextFormErrors);
      setError(nextFormErrors[firstErrorKey]);
      window.setTimeout(() => setError(""), 2600);
      window.requestAnimationFrame(() => {
        formFieldRefs.current[firstErrorKey]?.scrollIntoView?.({
          behavior: "smooth",
          block: "center",
        });
        formFieldRefs.current[firstErrorKey]?.focus?.();
      });
      return;
    }

    setIsSaving(true);
    setFormErrors({});
    setError("");
    try {
      let payload = {
        ...form,
        profileImageUrl: pendingImageFile ? form.profileImageUrl || "" : form.profileImageUrl,
        brand: isAdmin && filters.brand !== "all" ? filters.brand : brandId,
      };

      if (formMode === "edit" && pendingImageFile) {
        payload = {
          ...payload,
          profileImageUrl: await uploadPendingImage(editingMember.id),
        };
      }

      const response = await fetch(formMode === "edit" ? `/api/members/${editingMember.id}` : "/api/members", {
        method: formMode === "edit" ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) {
        throw new Error(result.error || "บันทึกสมาชิกไม่สำเร็จ");
      }

      if (formMode === "create" && pendingImageFile && result.member?.id) {
        const imageUrl = await uploadPendingImage(result.member.id);
        const imageResponse = await fetch(`/api/members/${result.member.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ profileImageUrl: imageUrl }),
        });
        const imageResult = await imageResponse.json().catch(() => ({}));
        if (!imageResponse.ok || !imageResult.success) {
          throw new Error(imageResult.error || "บันทึกรูปโปรไฟล์ไม่สำเร็จ");
        }
      }

      resetImagePreview();
      setFormOpen(false);
      setEditingMember(null);
      setMessage(formMode === "edit" ? "อัปเดตข้อมูลสมาชิกแล้ว" : `เพิ่มสมาชิก ${result.member?.memberCode || ""} แล้ว`);
      window.setTimeout(() => setMessage(""), 2600);
      await refreshAfterAction();
    } catch (saveError) {
      setError(saveError?.message || "บันทึกสมาชิกไม่สำเร็จ");
      window.setTimeout(() => setError(""), 3200);
    } finally {
      setIsSaving(false);
    }
  };

  const deleteMember = async (member) => {
    const confirmed = window.confirm(`ต้องการย้ายสมาชิก ${member.memberCode} ${member.fullName} ไปยังถังขยะหรือไม่?`);
    if (!confirmed) return;

    setPendingActionId(`delete:${member.id}`);
    try {
      const response = await fetch(`/api/members/${member.id}`, { method: "DELETE" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) throw new Error(result.error || "ลบสมาชิกไม่สำเร็จ");
      setMessage("ย้ายสมาชิกไปยังถังขยะแล้ว");
      setSelectedMember(null);
      await refreshAfterAction();
    } catch (deleteError) {
      setError(deleteError?.message || "ลบสมาชิกไม่สำเร็จ");
    } finally {
      setPendingActionId("");
    }
  };

  const restoreMember = async (member) => {
    setPendingActionId(`restore:${member.id}`);
    try {
      const response = await fetch(`/api/members/${member.id}/restore`, { method: "POST" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) throw new Error(result.error || "กู้คืนสมาชิกไม่สำเร็จ");
      setMessage("กู้คืนสมาชิกแล้ว");
      await refreshAfterAction();
    } catch (restoreError) {
      setError(restoreError?.message || "กู้คืนสมาชิกไม่สำเร็จ");
    } finally {
      setPendingActionId("");
    }
  };

  const permanentDeleteMember = async (member) => {
    const firstConfirm = window.confirm(`ลบสมาชิก ${member.memberCode} แบบถาวรหรือไม่?`);
    if (!firstConfirm) return;
    const secondConfirm = window.confirm("ยืนยันอีกครั้ง: การลบถาวรไม่สามารถกู้คืนได้");
    if (!secondConfirm) return;

    setPendingActionId(`permanent:${member.id}`);
    try {
      const response = await fetch(`/api/members/${member.id}/permanent`, { method: "DELETE" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) throw new Error(result.error || "ลบถาวรไม่สำเร็จ");
      setMessage("ลบสมาชิกถาวรแล้ว");
      await refreshAfterAction();
    } catch (deleteError) {
      setError(deleteError?.message || "ลบถาวรไม่สำเร็จ");
    } finally {
      setPendingActionId("");
    }
  };

  const handleImageChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const compressedFile = await compressImageFile(file);
      resetImagePreview();
      const url = URL.createObjectURL(compressedFile);
      previewUrlRef.current = url;
      setPreviewUrl(url);
      setPendingImageFile(compressedFile);
      setFormValue("profileImageUrl", "");
    } catch (imageError) {
      setError(imageError?.message || "รูปโปรไฟล์ไม่ถูกต้อง");
      window.setTimeout(() => setError(""), 2600);
      event.target.value = "";
    }
  };

  const copyText = async (value, successMessage) => {
    try {
      await navigator.clipboard.writeText(value);
      setMessage(successMessage);
      window.setTimeout(() => setMessage(""), 1800);
    } catch {
      setError("คัดลอกไม่สำเร็จ");
    }
  };

  const filterSummary = useMemo(
    () => [filters.position, filters.status, filters.gender, filters.province].filter(Boolean).length,
    [filters]
  );

  const renderMemberActions = (member, compact = false) => {
    const baseClass = compact
      ? "min-h-10 flex-1 rounded-xl px-3 text-[13px] font-extrabold transition"
      : "inline-flex min-h-9 items-center justify-center rounded-xl px-3 text-xs font-extrabold transition";

    if (trashMode) {
      return (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => restoreMember(member)}
            disabled={pendingActionId === `restore:${member.id}`}
            className={`${baseClass} border border-green-200 bg-green-50 text-green-700 hover:bg-green-100 disabled:opacity-50`}
          >
            กู้คืน
          </button>
          {isAdmin && (
            <button
              type="button"
              onClick={() => permanentDeleteMember(member)}
              disabled={pendingActionId === `permanent:${member.id}`}
              className={`${baseClass} border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50`}
            >
              ลบถาวร
            </button>
          )}
        </div>
      );
    }

    return (
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => openDetail(member)}
          disabled={pendingActionId === `detail:${member.id}`}
          className={`${baseClass} text-white disabled:opacity-50`}
          style={brandChrome.actionView}
        >
          ดู
        </button>
        <button
          type="button"
          onClick={() => openEditForm(member)}
          disabled={pendingActionId === `edit:${member.id}`}
          className={`${baseClass} border bg-white text-zinc-700 hover:bg-zinc-50 disabled:opacity-50`}
          style={{ borderColor: brandChrome.theme.border }}
        >
          แก้ไข
        </button>
        <button
          type="button"
          onClick={() => deleteMember(member)}
          disabled={pendingActionId === `delete:${member.id}`}
          className={`${baseClass} border border-red-100 bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-50`}
        >
          ลบ
        </button>
      </div>
    );
  };

  return (
    <main className="mx-auto flex w-full max-w-[1500px] flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
      <section className="rounded-[28px] border bg-white p-4 shadow-sm sm:p-6" style={{ borderColor: brandChrome.theme.border }}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em]" style={{ color: brandChrome.theme.accent }}>
              Team Directory
            </p>
            <h1 className="mt-1 text-3xl font-black tracking-tight text-zinc-950">สมาชิก</h1>
            <p className="mt-1 text-sm font-semibold text-zinc-500">จัดการข้อมูลทีมงานและบุคลากร</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setTrashMode((current) => !current)}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border bg-white px-4 text-sm font-extrabold text-zinc-700 transition hover:-translate-y-0.5 hover:bg-zinc-50"
              style={{ borderColor: brandChrome.theme.border }}
            >
              <Icon name="trash" className="h-4 w-4" />
              {trashMode ? "รายการสมาชิก" : "ถังขยะ"}
            </button>
            <button
              type="button"
              onClick={openCreateForm}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-extrabold text-white shadow-sm transition hover:-translate-y-0.5"
              style={brandChrome.primaryButton}
            >
              <Icon name="plus" className="h-4 w-4" />
              เพิ่มสมาชิก
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(240px,1.5fr)_repeat(5,minmax(130px,1fr))]">
          <label className="relative">
            <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="ค้นหารหัส ชื่อ เบอร์ อีเมล LINE Facebook"
              className="h-11 w-full rounded-xl border border-zinc-200 bg-white pl-10 pr-3 text-sm font-semibold outline-none transition focus:border-[var(--brand-accent)] focus:ring-4 focus:ring-amber-100"
            />
          </label>
          {isAdmin && (
            <SelectInput
              value={filters.brand}
              onChange={(event) => {
                setFilters((current) => ({ ...current, brand: event.target.value }));
                setPage(0);
              }}
            >
              <option value="all">ทุกแบรนด์</option>
              <option value="pharadol">Pharadol</option>
              <option value="adisorn">Adisorn</option>
            </SelectInput>
          )}
          <SelectInput
            value={filters.position}
            onChange={(event) => {
              setFilters((current) => ({ ...current, position: event.target.value }));
              setPage(0);
            }}
          >
            <option value="">ทุกตำแหน่ง</option>
            {MEMBER_POSITIONS.map((position) => (
              <option key={position} value={position}>{position}</option>
            ))}
          </SelectInput>
          <SelectInput
            value={filters.status}
            onChange={(event) => {
              setFilters((current) => ({ ...current, status: event.target.value }));
              setPage(0);
            }}
          >
            <option value="">ทุกสถานะ</option>
            {MEMBER_STATUSES.map((status) => (
              <option key={status} value={status}>{status}</option>
            ))}
          </SelectInput>
          <SelectInput
            value={filters.gender}
            onChange={(event) => {
              setFilters((current) => ({ ...current, gender: event.target.value }));
              setPage(0);
            }}
          >
            <option value="">ทุกเพศ</option>
            {MEMBER_GENDERS.map((gender) => (
              <option key={gender} value={gender}>{gender}</option>
            ))}
          </SelectInput>
          <SelectInput
            value={filters.province}
            onChange={(event) => {
              setFilters((current) => ({ ...current, province: event.target.value }));
              setPage(0);
            }}
          >
            <option value="">ทุกจังหวัด</option>
            {THAI_PROVINCES.map((province) => (
              <option key={province} value={province}>{province}</option>
            ))}
          </SelectInput>
          <SelectInput
            value={sort}
            onChange={(event) => {
              setSort(event.target.value);
              setPage(0);
            }}
          >
            {SORT_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </SelectInput>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-zinc-500">
          <span>{trashMode ? "ถังขยะสมาชิก" : "สมาชิกที่ใช้งาน"} {total.toLocaleString("th-TH")} รายการ {filterSummary > 0 ? `(${filterSummary} ตัวกรอง)` : ""}</span>
          <label className="flex items-center gap-2">
            แสดง
            <select
              value={pageSize}
              onChange={(event) => {
                setPageSize(Number(event.target.value));
                setPage(0);
              }}
              className="h-9 rounded-lg border border-zinc-200 bg-white px-2 text-xs font-black"
            >
              {[20, 50, 100].map((size) => (
                <option key={size} value={size}>{size}</option>
              ))}
            </select>
            รายการ
          </label>
        </div>
      </section>

      {(message || error) && (
        <div className={`fixed right-4 top-4 z-[100] max-w-[calc(100vw-32px)] rounded-2xl border px-4 py-3 text-sm font-bold shadow-2xl sm:max-w-sm ${error ? "border-red-100 bg-red-50 text-red-700" : "border-green-100 bg-green-50 text-green-700"}`}>
          {error || message}
        </div>
      )}

      <section className="rounded-[28px] border bg-white p-3 shadow-sm sm:p-4" style={{ borderColor: brandChrome.theme.border }}>
        {isLoading ? (
          <div className="grid gap-3">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="h-20 animate-pulse rounded-2xl bg-zinc-100" />
            ))}
          </div>
        ) : members.length === 0 ? (
          <div className="flex min-h-[320px] flex-col items-center justify-center rounded-3xl border border-dashed border-zinc-200 bg-zinc-50/70 px-4 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl" style={{ backgroundColor: brandChrome.theme.accentSoft, color: brandChrome.theme.primary }}>
              <Icon name="plus" />
            </div>
            <h2 className="mt-4 text-xl font-black text-zinc-900">ยังไม่มีข้อมูลสมาชิก</h2>
            <p className="mt-1 text-sm font-semibold text-zinc-500">เพิ่มสมาชิกคนแรกเพื่อเริ่มจัดการข้อมูลทีมงาน</p>
            {!trashMode && (
              <button
                type="button"
                onClick={openCreateForm}
                className="mt-4 min-h-11 rounded-xl px-4 text-sm font-extrabold text-white"
                style={brandChrome.primaryButton}
              >
                เพิ่มสมาชิก
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="hidden overflow-hidden rounded-2xl border border-zinc-100 lg:block">
              <table className="w-full table-fixed text-left">
                <thead style={brandChrome.tableHeader}>
                  <tr className="text-xs font-black uppercase tracking-wide">
                    <th className="w-[24%] px-4 py-3">สมาชิก</th>
                    <th className="w-[12%] px-4 py-3">ชื่อเล่น</th>
                    <th className="w-[16%] px-4 py-3">ตำแหน่ง</th>
                    <th className="w-[14%] px-4 py-3">ติดต่อ</th>
                    <th className="w-[12%] px-4 py-3">สถานะ</th>
                    <th className="w-[12%] px-4 py-3">แก้ไขล่าสุด</th>
                    <th className="w-[10%] px-4 py-3 text-right">จัดการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {members.map((member) => (
                    <tr key={member.id} className="align-middle text-sm">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <Avatar member={member} />
                          <div className="min-w-0">
                            <p className="truncate font-black text-zinc-900">{member.fullName || "-"}</p>
                            <p className="mt-0.5 text-xs font-bold text-zinc-500">{member.memberCode}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-bold text-zinc-600">{member.nickname || "-"}</td>
                      <td className="px-4 py-3 font-bold text-zinc-700">{member.position === "อื่นๆ" ? member.positionOther : member.position || "-"}</td>
                      <td className="px-4 py-3">
                        <p className="truncate font-bold text-zinc-700">{member.phone || "-"}</p>
                        <p className="truncate text-xs font-semibold text-zinc-500">{member.email || "-"}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-black ${getStatusClassName(member.status)}`}>
                          {member.status || "-"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs font-bold text-zinc-500">{formatDate(member.updatedAt || member.createdAt)}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end">{renderMemberActions(member)}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid gap-3 lg:hidden">
              {members.map((member) => (
                <article key={member.id} className="rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm">
                  <div className="flex items-start gap-3">
                    <Avatar member={member} size="h-14 w-14" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-black" style={{ color: brandChrome.theme.accent }}>{member.memberCode}</p>
                      <h2 className="truncate text-base font-black text-zinc-950">{member.fullName || "-"}</h2>
                      <p className="mt-0.5 text-sm font-bold text-zinc-500">{member.nickname || "ไม่มีชื่อเล่น"}</p>
                    </div>
                    <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-black ${getStatusClassName(member.status)}`}>
                      {member.status || "-"}
                    </span>
                  </div>
                  <dl className="mt-4 grid grid-cols-2 gap-2 text-[13px]">
                    <div className="rounded-xl bg-zinc-50 p-3">
                      <dt className="font-bold text-zinc-400">ตำแหน่ง</dt>
                      <dd className="mt-1 font-extrabold text-zinc-800">{member.position === "อื่นๆ" ? member.positionOther : member.position || "-"}</dd>
                    </div>
                    <div className="rounded-xl bg-zinc-50 p-3">
                      <dt className="font-bold text-zinc-400">เบอร์โทร</dt>
                      <dd className="mt-1 truncate font-extrabold text-zinc-800">{member.phone || "-"}</dd>
                    </div>
                  </dl>
                  <div className="mt-3">{renderMemberActions(member, true)}</div>
                </article>
              ))}
            </div>

            <div className="mt-4 flex flex-col gap-3 border-t border-zinc-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs font-bold text-zinc-500">
                หน้า {(page + 1).toLocaleString("th-TH")} จาก {totalPages.toLocaleString("th-TH")}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.max(0, current - 1))}
                  disabled={!canGoPrev}
                  className="min-h-10 rounded-xl border border-zinc-200 bg-white px-4 text-sm font-bold text-zinc-700 disabled:opacity-45"
                >
                  ก่อนหน้า
                </button>
                <button
                  type="button"
                  onClick={() => setPage((current) => current + 1)}
                  disabled={!canGoNext}
                  className="min-h-10 rounded-xl border border-zinc-200 bg-white px-4 text-sm font-bold text-zinc-700 disabled:opacity-45"
                >
                  ถัดไป
                </button>
              </div>
            </div>
          </>
        )}
      </section>

      {selectedMember && (
        <div className="fixed inset-0 z-[70] overflow-y-auto bg-black/45 px-3 py-5">
          <section className="mx-auto max-w-4xl rounded-[28px] bg-white p-4 shadow-2xl sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 items-start gap-3">
                <Avatar member={selectedMember} size="h-16 w-16" />
                <div className="min-w-0">
                  <p className="text-xs font-black" style={{ color: brandChrome.theme.accent }}>{selectedMember.memberCode}</p>
                  <h2 className="truncate text-2xl font-black text-zinc-950">{selectedMember.fullName}</h2>
                  <p className="mt-1 text-sm font-bold text-zinc-500">{selectedMember.nickname || "-"} · {selectedMember.position === "อื่นๆ" ? selectedMember.positionOther : selectedMember.position || "-"}</p>
                </div>
              </div>
              <button type="button" onClick={() => setSelectedMember(null)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-zinc-600">
                <Icon name="close" className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              {selectedMember.phone && <a href={`tel:${selectedMember.phone}`} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-zinc-200 px-3 text-sm font-bold text-zinc-700"><Icon name="phone" className="h-4 w-4" />โทร</a>}
              {selectedMember.email && <a href={`mailto:${selectedMember.email}`} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-zinc-200 px-3 text-sm font-bold text-zinc-700"><Icon name="mail" className="h-4 w-4" />ส่งอีเมล</a>}
              {selectedMember.lineId && <a href={buildLineUrl(selectedMember.lineId)} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center rounded-xl border border-zinc-200 px-3 text-sm font-bold text-zinc-700">LINE</a>}
              {selectedMember.facebook && <a href={buildFacebookUrl(selectedMember.facebook)} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center rounded-xl border border-zinc-200 px-3 text-sm font-bold text-zinc-700">Facebook</a>}
              <button type="button" onClick={() => copyText(selectedMember.memberCode, "คัดลอกรหัสสมาชิกแล้ว")} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-zinc-200 px-3 text-sm font-bold text-zinc-700"><Icon name="copy" className="h-4 w-4" />คัดลอกรหัส</button>
              <button type="button" onClick={() => openEditForm(selectedMember)} className="inline-flex min-h-10 items-center gap-2 rounded-xl px-3 text-sm font-bold text-white" style={brandChrome.primaryButton}><Icon name="edit" className="h-4 w-4" />แก้ไขข้อมูล</button>
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <DetailCard title="ข้อมูลส่วนตัว" rows={[
                ["วันเกิด", formatDate(selectedMember.birthDate)],
                ["อายุ", calculateAge(selectedMember.birthDate)],
                ["เพศ", selectedMember.gender === "อื่นๆ" ? selectedMember.genderOther || "อื่นๆ" : selectedMember.gender || "-"],
                ["สถานะ", selectedMember.status || "-"],
              ]} />
              <DetailCard title="ช่องทางติดต่อ" rows={[
                ["เบอร์โทรศัพท์", selectedMember.phone || "-"],
                ["อีเมล", selectedMember.email || "-"],
                ["LINE ID", selectedMember.lineId || "-"],
                ["Facebook", selectedMember.facebook || "-"],
                ["ผู้ติดต่อฉุกเฉิน", [selectedMember.emergencyContactName, selectedMember.emergencyContactRelationship, selectedMember.emergencyContactPhone].filter(Boolean).join(" · ") || "-"],
              ]} />
              <DetailCard title="ที่อยู่" rows={[
                ["ที่อยู่รวม", selectedMember.addressText || "-"],
                ["จังหวัด", selectedMember.addressProvince || "-"],
              ]}>
                {selectedMember.addressText && (
                  <button type="button" onClick={() => copyText(selectedMember.addressText, "คัดลอกที่อยู่แล้ว")} className="mt-3 min-h-9 rounded-xl border border-zinc-200 px-3 text-xs font-black text-zinc-700">
                    คัดลอกที่อยู่
                  </button>
                )}
              </DetailCard>
              <DetailCard title="ข้อมูลการเงิน" rows={[
                ["ธนาคาร", selectedMember.bankName === "อื่นๆ" ? selectedMember.bankNameOther || "อื่นๆ" : selectedMember.bankName || "-"],
                ["ชื่อบัญชี", selectedMember.bankAccountName || "-"],
                ["เลขบัญชี", bankVisible ? selectedMember.bankAccountNumber || "-" : selectedMember.bankAccountNumberMasked || "-"],
              ]}>
                {selectedMember.bankAccountNumber && (
                  <button type="button" onClick={() => setBankVisible((current) => !current)} className="mt-3 min-h-9 rounded-xl border border-zinc-200 px-3 text-xs font-black text-zinc-700">
                    {bankVisible ? "ซ่อนเลขบัญชี" : "แสดงเลขบัญชี"}
                  </button>
                )}
              </DetailCard>
              <DetailCard title="ข้อมูลระบบ" rows={[
                ["วันที่สร้าง", formatDate(selectedMember.createdAt)],
                ["แก้ไขล่าสุด", formatDate(selectedMember.updatedAt)],
                ["สร้างโดย", selectedMember.createdBy || "-"],
                ["แก้ไขโดย", selectedMember.updatedBy || "-"],
              ]} />
              <DetailCard title="หมายเหตุ" rows={[["", selectedMember.notes || "-"]]} />
            </div>
          </section>
        </div>
      )}

      {formOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center overflow-hidden bg-black/45 px-2 py-2 sm:px-4 sm:py-5">
          <form onSubmit={saveMember} noValidate className="flex max-h-[94dvh] w-[96vw] max-w-[1560px] flex-col overflow-hidden rounded-[24px] bg-white shadow-2xl max-md:max-h-[96dvh] max-md:w-[calc(100%-16px)]">
            <div className="flex shrink-0 items-start justify-between gap-4 border-b border-zinc-100 px-5 py-4 sm:px-6">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em]" style={{ color: brandChrome.theme.accent }}>
                  {formMode === "edit" ? form.memberCode : "New Member"}
                </p>
                <h2 className="mt-1 text-xl font-black text-zinc-950 sm:text-2xl">{formMode === "edit" ? "แก้ไขข้อมูลสมาชิก" : "เพิ่มสมาชิกใหม่"}</h2>
              </div>
              <button type="button" onClick={() => { resetImagePreview(); setFormOpen(false); }} className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-100 text-zinc-600">
                <Icon name="close" className="h-5 w-5" />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-zinc-50/60 px-4 py-3 pb-24 sm:px-5">
            <Section title="ข้อมูลส่วนตัว" icon="user" gridClassName="grid gap-3 md:grid-cols-2 xl:grid-cols-[160px_1fr_1fr_1fr]">
              <Field label="รูปโปรไฟล์" className="md:col-span-2 xl:row-span-2 xl:col-span-1">
                <div className="h-full rounded-2xl border border-zinc-200 bg-white p-2">
                  <div className="flex h-full items-center gap-2.5 max-md:justify-center md:justify-start xl:flex-col xl:items-center xl:justify-center">
                    <Avatar member={{ ...form, profileImageUrl: previewUrl || form.profileImageUrl, fullName: `${form.firstName} ${form.lastName}` }} size="h-16 w-16" />
                    <div className="min-w-0 flex-1 max-md:max-w-[220px] xl:w-full xl:flex-none">
                      <div className="relative inline-flex min-h-9 cursor-pointer items-center justify-center rounded-xl bg-zinc-100 px-3 text-xs font-black text-zinc-700 transition hover:bg-zinc-200">
                        คลิกเพื่อเลือกรูป
                        <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleImageChange} className="absolute inset-0 cursor-pointer opacity-0" />
                      </div>
                      <p className="mt-1 text-[11px] font-semibold leading-4 text-zinc-500">JPG, PNG, WebP ไม่เกิน 5 MB</p>
                      {(previewUrl || form.profileImageUrl) && (
                        <button type="button" onClick={() => { resetImagePreview(); setFormValue("profileImageUrl", ""); }} className="mt-1 text-xs font-black text-red-600">ลบรูป</button>
                      )}
                    </div>
                  </div>
                </div>
              </Field>
              <Field label="ชื่อ" required error={formErrors.firstName}><TextInput value={form.firstName} onChange={(event) => setFormValue("firstName", event.target.value)} error={formErrors.firstName} inputRef={(node) => { formFieldRefs.current.firstName = node; }} /></Field>
              <Field label="นามสกุล" required error={formErrors.lastName}><TextInput value={form.lastName} onChange={(event) => setFormValue("lastName", event.target.value)} error={formErrors.lastName} inputRef={(node) => { formFieldRefs.current.lastName = node; }} /></Field>
              <Field label="ชื่อเล่น"><TextInput value={form.nickname} onChange={(event) => setFormValue("nickname", event.target.value)} /></Field>
              <Field label="รหัสสมาชิก" className="xl:col-span-1"><TextInput value={form.memberCode || "สร้างอัตโนมัติหลังบันทึก"} disabled /></Field>
              <Field label="วันเดือนปีเกิด" error={formErrors.birthDate}><TextInput type="date" max={new Date().toISOString().slice(0, 10)} value={form.birthDate || ""} onChange={(event) => setFormValue("birthDate", event.target.value)} error={formErrors.birthDate} inputRef={(node) => { formFieldRefs.current.birthDate = node; }} /></Field>
              <Field label="อายุ"><TextInput value={calculateAge(form.birthDate)} readOnly /></Field>
              <Field label="เพศ">
                <SelectInput value={form.gender} onChange={(event) => setFormValue("gender", event.target.value)}>
                  <option value="">ไม่ระบุ</option>
                  {MEMBER_GENDERS.map((gender) => <option key={gender} value={gender}>{gender}</option>)}
                </SelectInput>
              </Field>
              {form.gender === "อื่นๆ" && <Field label="ระบุเพศเพิ่มเติม" className="xl:col-start-2"><TextInput value={form.genderOther} onChange={(event) => setFormValue("genderOther", event.target.value)} /></Field>}
            </Section>

            <Section title="ช่องทางติดต่อ" icon="phone" gridClassName="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <Field label="เบอร์โทรศัพท์" error={formErrors.phone}><TextInput inputMode="tel" placeholder="081-234-5678" value={form.phone} onChange={(event) => setFormValue("phone", event.target.value)} error={formErrors.phone} inputRef={(node) => { formFieldRefs.current.phone = node; }} /></Field>
              <Field label="อีเมล" error={formErrors.email}><TextInput type="email" placeholder="example@email.com" value={form.email} onChange={(event) => setFormValue("email", event.target.value)} error={formErrors.email} inputRef={(node) => { formFieldRefs.current.email = node; }} /></Field>
              <Field label="LINE ID"><TextInput placeholder="yourlineid" value={form.lineId} onChange={(event) => setFormValue("lineId", event.target.value)} /></Field>
              <Field label="Facebook"><TextInput placeholder="facebook.com/username" value={form.facebook} onChange={(event) => setFormValue("facebook", event.target.value)} /></Field>
              <Field label="ชื่อผู้ติดต่อฉุกเฉิน" className="xl:col-span-1"><TextInput placeholder="กรอกชื่อผู้ติดต่อ" value={form.emergencyContactName} onChange={(event) => setFormValue("emergencyContactName", event.target.value)} /></Field>
              <Field label="ความสัมพันธ์"><TextInput placeholder="เช่น พ่อ, แม่, พี่ชาย" value={form.emergencyContactRelationship} onChange={(event) => setFormValue("emergencyContactRelationship", event.target.value)} /></Field>
              <Field label="เบอร์ผู้ติดต่อฉุกเฉิน" error={formErrors.emergencyContactPhone}><TextInput inputMode="tel" placeholder="081-234-5678" value={form.emergencyContactPhone} onChange={(event) => setFormValue("emergencyContactPhone", event.target.value)} error={formErrors.emergencyContactPhone} inputRef={(node) => { formFieldRefs.current.emergencyContactPhone = node; }} /></Field>
            </Section>

            <Section title="ที่อยู่" icon="map" gridClassName="space-y-3">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[0.9fr_1.2fr_0.8fr_1fr_1fr]">
                <Field label="บ้านเลขที่"><TextInput placeholder="123/45" value={form.addressHouseNumber} onChange={(event) => setFormValue("addressHouseNumber", event.target.value)} /></Field>
                <Field label="อาคาร / หมู่บ้าน"><TextInput placeholder="หมู่บ้านสุขสวัสดิ์" value={form.addressBuildingVillage} onChange={(event) => setFormValue("addressBuildingVillage", event.target.value)} /></Field>
                <Field label="หมู่"><TextInput placeholder="5" value={form.addressMoo} onChange={(event) => setFormValue("addressMoo", event.target.value)} /></Field>
                <Field label="ซอย"><TextInput placeholder="รามคำแหง 24" value={form.addressSoi} onChange={(event) => setFormValue("addressSoi", event.target.value)} /></Field>
                <Field label="ถนน"><TextInput placeholder="รามคำแหง" value={form.addressRoad} onChange={(event) => setFormValue("addressRoad", event.target.value)} /></Field>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <Field label="ตำบล / แขวง"><TextInput placeholder="หัวหมาก" value={form.addressSubdistrict} onChange={(event) => setFormValue("addressSubdistrict", event.target.value)} /></Field>
                <Field label="อำเภอ / เขต"><TextInput placeholder="บางกะปิ" value={form.addressDistrict} onChange={(event) => setFormValue("addressDistrict", event.target.value)} /></Field>
                <Field label="จังหวัด">
                  <SelectInput value={form.addressProvince} onChange={(event) => setFormValue("addressProvince", event.target.value)}>
                    <option value="">เลือกจังหวัด</option>
                    {THAI_PROVINCES.map((province) => <option key={province} value={province}>{province}</option>)}
                  </SelectInput>
                </Field>
                <Field label="รหัสไปรษณีย์" error={formErrors.addressPostalCode}><TextInput inputMode="numeric" maxLength={5} placeholder="10240" value={form.addressPostalCode} onChange={(event) => setFormValue("addressPostalCode", event.target.value.replace(/\D/g, "").slice(0, 5))} error={formErrors.addressPostalCode} inputRef={(node) => { formFieldRefs.current.addressPostalCode = node; }} /></Field>
              </div>
            </Section>

            <div className="grid gap-3 xl:grid-cols-2">
              <Section title="ข้อมูลบัญชีธนาคาร" icon="bank" gridClassName="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                <Field label="ธนาคาร">
                  <SelectInput value={form.bankName} onChange={(event) => setFormValue("bankName", event.target.value)}>
                    <option value="">เลือกธนาคาร</option>
                    {THAI_BANKS.map((bank) => <option key={bank} value={bank}>{bank}</option>)}
                  </SelectInput>
                </Field>
                {form.bankName === "อื่นๆ" && <Field label="ระบุชื่อธนาคาร" required error={formErrors.bankNameOther}><TextInput value={form.bankNameOther} onChange={(event) => setFormValue("bankNameOther", event.target.value)} error={formErrors.bankNameOther} inputRef={(node) => { formFieldRefs.current.bankNameOther = node; }} /></Field>}
                <Field label="ชื่อบัญชี"><TextInput value={form.bankAccountName} onChange={(event) => setFormValue("bankAccountName", event.target.value)} /></Field>
                <Field label="เลขบัญชีธนาคาร"><TextInput inputMode="numeric" value={form.bankAccountNumber || ""} onChange={(event) => setFormValue("bankAccountNumber", event.target.value)} /></Field>
              </Section>

              <Section title="ข้อมูลการทำงาน" icon="briefcase" gridClassName="grid gap-3 md:grid-cols-2">
                <Field label="ตำแหน่ง" required error={formErrors.position}>
                  <SelectInput value={form.position} onChange={(event) => setFormValue("position", event.target.value)} error={formErrors.position} inputRef={(node) => { formFieldRefs.current.position = node; }}>
                    <option value="">เลือกตำแหน่ง</option>
                    {MEMBER_POSITIONS.map((position) => <option key={position} value={position}>{position}</option>)}
                  </SelectInput>
                </Field>
                <Field label="สถานะสมาชิก" required error={formErrors.status}>
                  <SelectInput value={form.status} onChange={(event) => setFormValue("status", event.target.value)} error={formErrors.status} inputRef={(node) => { formFieldRefs.current.status = node; }}>
                    {MEMBER_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                  </SelectInput>
                </Field>
                {form.position === "อื่นๆ" && <Field label="ระบุตำแหน่ง" required error={formErrors.positionOther} className="md:col-span-2"><TextInput value={form.positionOther} onChange={(event) => setFormValue("positionOther", event.target.value)} error={formErrors.positionOther} inputRef={(node) => { formFieldRefs.current.positionOther = node; }} /></Field>}
              </Section>
            </div>

            <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <h3 className="flex items-center gap-2 text-[15px] font-black text-zinc-900">
                  <span
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                    style={{
                      backgroundColor: "var(--brand-accent-soft)",
                      color: "var(--brand-primary)",
                    }}
                  >
                    <Icon name="note" className="h-4 w-4" />
                  </span>
                  หมายเหตุเพิ่มเติม
                </h3>
              </div>
              <div className="relative mt-3.5">
                <textarea
                  value={form.notes}
                  onChange={(event) => setFormValue("notes", event.target.value.slice(0, 2000))}
                  rows={3}
                  placeholder="กรอกหมายเหตุเพิ่มเติม (ถ้ามี)"
                  className="min-h-[76px] w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 pb-6 text-sm font-semibold text-zinc-800 outline-none transition placeholder:text-zinc-400 focus:border-[var(--brand-accent)] focus:ring-4 focus:ring-amber-100 max-md:text-base"
                />
                <span className="pointer-events-none absolute bottom-2 right-3 text-xs font-bold text-zinc-400">{(form.notes || "").length}/2000</span>
              </div>
            </section>

            </div>

            <div className="shrink-0 border-t border-zinc-200 bg-white px-4 py-3 shadow-[0_-12px_24px_rgba(15,23,42,0.06)] sm:flex sm:justify-end sm:gap-2 sm:px-6">
              <button type="button" onClick={() => { resetImagePreview(); setFormErrors({}); setFormOpen(false); }} disabled={isSaving} className="min-h-11 rounded-xl border border-zinc-200 bg-white px-5 text-sm font-extrabold text-zinc-700 disabled:opacity-50">
                ยกเลิก
              </button>
              <button type="submit" disabled={isSaving} className="min-h-11 rounded-xl px-5 text-sm font-extrabold text-white shadow-sm disabled:opacity-50" style={brandChrome.primaryButton}>
                {isSaving ? "กำลังบันทึก..." : "บันทึกสมาชิก"}
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}

const DetailCard = ({ title, rows, children }) => (
  <section className="rounded-2xl border border-zinc-100 bg-zinc-50/70 p-4">
    <h3 className="text-sm font-black text-zinc-900">{title}</h3>
    <dl className="mt-3 space-y-2">
      {rows.map(([label, value]) => (
        <div key={`${title}:${label}:${value}`} className={label ? "grid gap-2 sm:grid-cols-[130px,1fr]" : ""}>
          {label && <dt className="text-xs font-black text-zinc-400">{label}</dt>}
          <dd className="min-w-0 whitespace-pre-wrap break-words text-sm font-bold text-zinc-700">{value}</dd>
        </div>
      ))}
    </dl>
    {children}
  </section>
);
