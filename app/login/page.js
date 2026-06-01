"use client";

import { useState, useEffect } from "react";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    const loggedIn = localStorage.getItem("loggedIn");

    if (loggedIn) {
      window.location.href = "/dashboard";
    }
  }, []);

  const handleLogin = () => {
    if (
      username === "admin" &&
      password === "1234"
    ) {
      localStorage.setItem(
        "loggedIn",
        "true"
      );

      window.location.href = "/dashboard";
    } else {
      alert("ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-100">

      <div className="bg-white p-8 rounded-3xl shadow-xl w-[400px]">

        <h1 className="text-3xl font-bold mb-6 text-center">
          Login
        </h1>

        <input
          type="text"
          placeholder="Username"
          value={username}
          onChange={(e) =>
            setUsername(e.target.value)
          }
          className="w-full border p-4 rounded-xl mb-4"
        />

        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) =>
            setPassword(e.target.value)
          }
          className="w-full border p-4 rounded-xl mb-6"
        />

        <button
          onClick={handleLogin}
          className="w-full bg-black text-white py-4 rounded-xl"
        >
          เข้าสู่ระบบ
        </button>

      </div>

    </div>
  );
}