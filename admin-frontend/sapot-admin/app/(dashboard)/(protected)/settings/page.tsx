'use client';

import { useEffect, useState } from 'react';
import { withBasePath } from '@/lib/basePath';

const inputStyle =
  'w-full bg-gray-50 px-4 py-3 rounded-xl outline-none transition-all focus:bg-white focus:ring-2 focus:ring-blue-500 placeholder:text-gray-400 text-gray-700';

const labelStyle =
  'block mb-2 text-sm font-semibold text-gray-700';

export default function SettingsPage() {
  const [formData, setFormData] = useState({
    username: '',
    first_name: '',
    last_name: '',
    phone_number: '',
    email: '',
  });

  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] =
    useState(true);

  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  // =========================
  // Load Current User
  // =========================
  useEffect(() => {
    async function loadUser() {
      try {
        const res = await fetch(withBasePath('/api/current-user'));

        const data = await res.json();

        if (!res.ok) {
          throw new Error(
            data.error || 'Failed to load user'
          );
        }

        setFormData({
          username: data.username || '',
          first_name: data.first_name || '',
          last_name: data.last_name || '',
          phone_number: data.phone_number || '',
          email: data.email || '',
        });
      } catch (err: any) {
        setError(err.message);
      } finally {
        setInitialLoading(false);
      }
    }

    loadUser();
  }, []);

  // =========================
  // Handle Input Change
  // =========================
  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  // =========================
  // Submit
  // =========================
  const handleSubmit = async (
    e: React.FormEvent
  ) => {
    e.preventDefault();

    setLoading(true);
    setMessage('');
    setError('');

    try {
      const res = await fetch(
        '/api/update-profile',
        {
          method: 'POST',
          headers: {
            'Content-Type':
              'application/json',
          },
          body: JSON.stringify(formData),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        throw new Error(
          data.error || 'Update failed'
        );
      }

      setMessage(
        'Profile updated successfully'
      );
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // =========================
  // Loading State
  // =========================
  if (initialLoading) {
    return (
      <div className="p-6">
        <div className="bg-white rounded-3xl p-8 shadow-sm">
          <div className="text-gray-500">
            Loading user information...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full p-6">
      <div className="bg-white rounded-3xl p-8 shadow-sm max-w-5xl">
        {/* Header */}
        <div className="mb-8">
          <div className="font-bold text-3xl text-gray-800">
            Account Settings
          </div>

          <p className="text-gray-500 mt-2">
            Update your profile information
          </p>
        </div>

        {/* Form */}
        <form
          onSubmit={handleSubmit}
          className="space-y-6"
        >
          {/* Username */}
          <div>
            <label className={labelStyle}>
              Username
            </label>

            <input
              type="text"
              name="username"
              value={formData.username}
              onChange={handleChange}
              className={inputStyle}
              placeholder="Enter username"
              required
            />
          </div>

          {/* First & Last Name */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className={labelStyle}>
                First Name
              </label>

              <input
                type="text"
                name="first_name"
                value={formData.first_name}
                onChange={handleChange}
                className={inputStyle}
                placeholder="Juan"
                required
              />
            </div>

            <div>
              <label className={labelStyle}>
                Last Name
              </label>

              <input
                type="text"
                name="last_name"
                value={formData.last_name}
                onChange={handleChange}
                className={inputStyle}
                placeholder="Dela Cruz"
                required
              />
            </div>
          </div>

          {/* Contact Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className={labelStyle}>
                Phone Number
              </label>

              <input
                type="tel"
                name="phone_number"
                value={formData.phone_number}
                onChange={handleChange}
                className={inputStyle}
                placeholder="+639XXXXXXXXX"
              />
            </div>

            <div>
              <label className={labelStyle}>
                Email Address
              </label>

              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                className={inputStyle}
                placeholder="user@example.com"
              />
            </div>
          </div>

          {/* Status Messages */}
          {(message || error) && (
            <div
              className={`rounded-2xl px-4 py-3 text-sm font-medium ${
                error
                  ? 'bg-red-50 text-red-600'
                  : 'bg-green-50 text-green-600'
              }`}
            >
              {error || message}
            </div>
          )}

          {/* Submit */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-3 px-8 rounded-2xl transition-all shadow-lg shadow-blue-100"
            >
              {loading
                ? 'Saving Changes...'
                : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
