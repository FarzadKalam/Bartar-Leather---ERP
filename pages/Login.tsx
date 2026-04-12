import { useEffect, useState } from 'react';
import { App as AntdApp, Button, Card, Input } from 'antd';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';

const isNetworkError = (error: unknown): boolean => {
  const message = String((error as any)?.message || '').toLowerCase();
  return (
    message.includes('failed to fetch') ||
    message.includes('network') ||
    message.includes('connection') ||
    message.includes('err_connection_reset') ||
    message.includes('err_internet_disconnected') ||
    message.includes('err_network_changed')
  );
};

const Login = () => {
  const { message } = AntdApp.useApp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const hash = window.location.hash || '';
    const search = window.location.search || '';
    if (hash.includes('type=recovery') || search.includes('type=recovery')) {
      setRecoveryMode(true);
    }

    const { data: subscription } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setRecoveryMode(true);
      }
    });

    return () => {
      subscription?.subscription?.unsubscribe();
    };
  }, []);

  const handleLogin = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;

      message.success('خوش آمدید! در حال ورود...');
      navigate('/');
    } catch (error: any) {
      if (isNetworkError(error)) {
        message.error('Cannot reach auth server. Check internet/VPN and Supabase server.');
      } else {
        message.error('Login failed: ' + error.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!email) {
      message.error('لطفا ایمیل را وارد کنید');
      return;
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login`,
    });

    if (error) {
      message.error('خطا در ارسال ایمیل: ' + error.message);
    } else {
      message.success('لینک بازیابی رمز عبور ارسال شد');
    }
  };

  const handleSetNewPassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      message.error('رمز عبور جدید باید حداقل ۶ کاراکتر باشد');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      message.error('رمز عبور و تکرار آن یکسان نیست');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;

      message.success('رمز عبور با موفقیت تغییر کرد');
      setRecoveryMode(false);
      setNewPassword('');
      setConfirmNewPassword('');
      window.history.replaceState({}, document.title, '/login');
      navigate('/');
    } catch (error: any) {
      if (isNetworkError(error)) {
        message.error('Cannot reach auth server. Check internet/VPN and Supabase server.');
      } else {
        message.error('Password update failed: ' + error.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_right,rgba(95,144,117,0.22),transparent_24%),radial-gradient(circle_at_bottom_left,rgba(31,69,52,0.16),transparent_24%),linear-gradient(180deg,#f8fbf9_0%,#edf5ef_100%)] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="bg-white/90 rounded-[2rem] shadow-[0_22px_50px_rgba(17,41,31,0.1)] border border-leather-100 px-6 py-5 backdrop-blur">
            <div className="text-lg font-black text-leather-600">تولیدی چرم مهربانو</div>
            <div className="text-xs text-leather-700/70 mt-1">Mehrbanoo Leather ERP</div>
          </div>
        </div>

        <Card title="ورود به سیستم" className="w-full rounded-[2rem] border border-leather-100 shadow-[0_24px_60px_rgba(17,41,31,0.1)]" styles={{ header: { borderBottom: '1px solid #e4eee7' }, body: { padding: 24 } }}>
          <div className="flex flex-col gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">ایمیل</label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@example.com" />
            </div>

            {!recoveryMode && (
              <>
                <div>
                  <label className="block text-sm font-medium mb-1">رمز عبور</label>
                  <Input.Password value={password} onChange={(e) => setPassword(e.target.value)} placeholder="رمز عبور" />
                </div>
                <Button type="primary" onClick={handleLogin} loading={loading} className="w-full bg-leather-600 h-11 text-lg rounded-xl shadow-lg shadow-leather-500/20">
                  ورود
                </Button>
                <Button type="link" onClick={handleResetPassword} className="text-xs">
                  فراموشی رمز عبور
                </Button>
              </>
            )}

            {recoveryMode && (
              <>
                <div>
                  <label className="block text-sm font-medium mb-1">رمز عبور جدید</label>
                  <Input.Password
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="حداقل ۶ کاراکتر"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">تکرار رمز عبور جدید</label>
                  <Input.Password
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    placeholder="تکرار رمز عبور"
                  />
                </div>
                <Button
                  type="primary"
                  onClick={handleSetNewPassword}
                  loading={loading}
                  className="w-full bg-leather-600 h-11 text-lg rounded-xl shadow-lg shadow-leather-500/20"
                >
                  ثبت رمز جدید
                </Button>
                <Button
                  type="link"
                  onClick={() => {
                    setRecoveryMode(false);
                    window.history.replaceState({}, document.title, '/login');
                  }}
                  className="text-xs"
                >
                  بازگشت به ورود
                </Button>
              </>
            )}
          </div>
        </Card>

        <div className="mt-4 text-center text-[11px] text-gray-400">نسخه {import.meta.env.VITE_APP_VERSION || '1.0.2'}</div>
      </div>
    </div>
  );
};

export default Login;
