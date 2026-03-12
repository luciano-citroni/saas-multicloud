import { LoginForm } from '@/components/auth/login/form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DefaultFramer } from '@/components/ui/frame-motion';

export default function SignInPage() {
    return (
        <div className="flex justify-center items-center w-full h-screen">
            <DefaultFramer className="w-[96%] sm:w-[75%] xl:w-[45%] max-w-xl">
                <Card>
                    <CardHeader className="mb-2 mt-2">
                        <CardTitle className="text-xl">Entrar na sua conta</CardTitle>
                        <CardDescription>Entre com seu email e senha ou use o Google.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <LoginForm />
                    </CardContent>
                </Card>
            </DefaultFramer>
        </div>
    );
}