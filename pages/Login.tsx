import React, { useState } from 'react';
import { supabase } from '../supabaseClient'; // مسیر رو چک کن
import { Button, Input, Card, message, Spin } from 'antd';
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
      const { data, error } = await supabase.auth.signInWithPassword({
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

  return (
    <div className="flex h-screen items-center justify-center bg-gray-100">
      <Card title="ورود به سیستم مدیریت" className="w-96 shadow-xl rounded-2xl">
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
            className="w-full bg-blue-600 h-10 text-lg"
          >
            ورود
          </Button>
        </div>
      </Card>
    </div>
  );
};

export default Login;