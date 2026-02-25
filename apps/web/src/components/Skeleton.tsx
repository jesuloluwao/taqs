import { cn } from '../lib/utils';

interface SkeletonProps {
  className?: string;
}

/** Animated shimmer placeholder for loading states */
export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn('animate-pulse rounded-md bg-neutral-200', className)}
    />
  );
}
