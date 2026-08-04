"use client";

const DEFAULT_MAX_STORAGE_BYTES = 2 * 1024 * 1024;

const getStorage = (storage = "local") => {
  if (typeof window === "undefined") return null;
  return storage === "session" ? window.sessionStorage : window.localStorage;
};

const removeBrokenKey = (store, key, error) => {
  try {
    store.removeItem(key);
  } catch {
    // Ignore storage cleanup failures.
  }

  console.error(
    `Removed unreadable storage key: ${key}`,
    error?.message || error || "invalid JSON"
  );
};

export const safeGetJson = (
  key,
  fallback = null,
  { storage = "local", maxBytes = DEFAULT_MAX_STORAGE_BYTES } = {}
) => {
  const store = getStorage(storage);
  if (!store) return fallback;

  let rawValue = "";

  try {
    rawValue = store.getItem(key) || "";
  } catch (error) {
    console.error(`Cannot read storage key: ${key}`, error);
    return fallback;
  }

  if (!rawValue) return fallback;

  if (rawValue.length > maxBytes) {
    console.warn(`Skipped oversized storage key: ${key}`);
    return fallback;
  }

  try {
    return JSON.parse(rawValue);
  } catch (error) {
    removeBrokenKey(store, key, error);
    return fallback;
  }
};

export const safeGetArray = (key, options = {}) => {
  const value = safeGetJson(key, [], options);
  return Array.isArray(value) ? value : [];
};

export const safeGetObject = (key, options = {}) => {
  const value = safeGetJson(key, null, options);
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : null;
};

export const safeSetJson = (
  key,
  value,
  { storage = "local", maxBytes = DEFAULT_MAX_STORAGE_BYTES } = {}
) => {
  const store = getStorage(storage);
  if (!store) return false;

  try {
    const serialized = JSON.stringify(value);
    if (serialized.length > maxBytes) {
      console.warn(`Skipped oversized storage write: ${key}`);
      return false;
    }
    store.setItem(key, serialized);
    return true;
  } catch (error) {
    console.error(`Cannot write storage key: ${key}`, error);
    return false;
  }
};
