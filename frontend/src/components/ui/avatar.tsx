import * as React from 'react';
import { cn } from '@/lib/utils';

const Avatar = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('relative flex h-10 w-10 shrink-0 overflow-hidden rounded-[4px] bg-secondary', className)} {...props} />
));
Avatar.displayName = 'Avatar';

const AvatarFallback = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('flex h-full w-full items-center justify-center rounded-[4px] bg-secondary text-[12px] font-extrabold text-foreground', className)} {...props} />
));
AvatarFallback.displayName = 'AvatarFallback';

export { Avatar, AvatarFallback };
