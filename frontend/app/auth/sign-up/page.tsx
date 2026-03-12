import { RegisterForm } from '@/components/auth/register/form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DefaultFramer } from '@/components/ui/frame-motion';

export default function RegisterPage() {
    return (
        <div className="flex justify-center items-center w-full h-screen">
            <DefaultFramer className="w-[96%] sm:w-[75%] xl:w-[45%] max-w-xl">
                <Card className="">
                    <CardHeader className="mb-2 mt-2">
                        <CardTitle className="text-xl">Criar nova conta</CardTitle>
                        <CardDescription>Crie uma nova conta para gerenciar sua empresa.</CardDescription>
                    </CardHeader>

                    <CardContent>
                        <RegisterForm />
                    </CardContent>
                </Card>
            </DefaultFramer>
        </div>
    );
}
