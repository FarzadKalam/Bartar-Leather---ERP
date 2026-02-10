import { useState } from 'react';
import { supabase } from '../supabaseClient'; // مسیر رو چک کن
import { Button, Input, Card, message } from 'antd';
import { useNavigate } from 'react-router-dom'; // یا useRouter اگر next/navigation داری

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async () => {
    setLoading(true);
    try {
      // 1. درخواست لاگین به سوپابیس
      const { error } = await supabase.auth.signInWithPassword({
        email: email,
        password: password,
      });

      if (error) throw error;

      // 2. لاگین موفق!
      message.success('خوش آمدید! در حال دریافت اطلاعات...');
      
      // 3. (مهم) رفتن به صفحه اصلی
      // سوپابیس خودش توکن رو توی کوکی/لوکال استوریج ذخیره میکنه
      // و بقیه صفحات اتوماتیک اون رو میخونن.
      navigate('/'); 
      
    } catch (error: any) {
      message.error('خطا در ورود: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!email) {
      message.error('لطفاً ایمیل را وارد کنید');
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) {
      message.error('خطا در ارسال ایمیل: ' + error.message);
    } else {
      message.success('لینک بازیابی رمز به ایمیل ارسال شد');
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 px-6 py-4">
            <div className="text-lg font-black text-leather-600">تولیدی چرم مهربانو</div>
            <div className="text-xs text-gray-400 mt-1">Mehrbanoo Leather ERP</div>
          </div>
        </div>

        <Card title="ورود به سیستم" className="w-full shadow-xl rounded-2xl">
          <div className="flex flex-col gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">ایمیل</label>
              <Input 
                value={email} 
                onChange={e => setEmail(e.target.value)} 
                placeholder="admin@kalamtaze.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">رمز عبور</label>
              <Input.Password 
                value={password} 
                onChange={e => setPassword(e.target.value)} 
                placeholder="رمز عبور"
              />
            </div>
            <Button 
              type="primary" 
              onClick={handleLogin} 
              loading={loading} 
              className="w-full bg-leather-600 h-10 text-lg"
            >
              ورود
            </Button>
            <Button type="link" onClick={handleResetPassword} className="text-xs">
              فراموشی رمز عبور
            </Button>
          </div>
        </Card>
        <div className="mt-4 text-center text-[11px] text-gray-400">
          نسخه {import.meta.env.VITE_APP_VERSION || '1.0.2'}
        </div>
      </div>
    </div>
  );
};

export default Login;