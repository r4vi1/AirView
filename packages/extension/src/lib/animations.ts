/**
 * CouchGang Spring Animations Library
 * Physics-based animations without external dependencies
 */

// Spring configuration presets
export const SPRING_CONFIGS = {
    stiff: { stiffness: 400, damping: 30, mass: 1 },
    gentle: { stiffness: 200, damping: 20, mass: 1 },
    bouncy: { stiffness: 300, damping: 15, mass: 1 },
    slow: { stiffness: 100, damping: 20, mass: 1 },
} as const;

export type SpringConfig = {
    stiffness: number;
    damping: number;
    mass: number;
};

/**
 * Calculate spring physics for a single step
 * Returns [position, velocity]
 */
export function springStep(
    current: number,
    target: number,
    velocity: number,
    config: SpringConfig,
    deltaTime: number = 1 / 60
): [number, number] {
    const { stiffness, damping, mass } = config;

    // Spring force: F = -k * x
    const displacement = current - target;
    const springForce = -stiffness * displacement;

    // Damping force: F = -c * v
    const dampingForce = -damping * velocity;

    // Acceleration: a = F / m
    const acceleration = (springForce + dampingForce) / mass;

    // Update velocity and position
    const newVelocity = velocity + acceleration * deltaTime;
    const newPosition = current + newVelocity * deltaTime;

    return [newPosition, newVelocity];
}

/**
 * Animate a value using spring physics
 */
export function animateSpring(
    from: number,
    to: number,
    config: SpringConfig,
    onUpdate: (value: number) => void,
    onComplete?: () => void
): () => void {
    let current = from;
    let velocity = 0;
    let animationId: number | null = null;
    let lastTime = performance.now();

    const threshold = 0.01;
    const velocityThreshold = 0.01;

    function tick(now: number) {
        const deltaTime = Math.min((now - lastTime) / 1000, 0.1); // Cap at 100ms
        lastTime = now;

        [current, velocity] = springStep(current, to, velocity, config, deltaTime);

        onUpdate(current);

        // Check if animation is complete
        const isComplete =
            Math.abs(current - to) < threshold &&
            Math.abs(velocity) < velocityThreshold;

        if (isComplete) {
            onUpdate(to); // Snap to final value
            onComplete?.();
        } else {
            animationId = requestAnimationFrame(tick);
        }
    }

    animationId = requestAnimationFrame(tick);

    // Return cancel function
    return () => {
        if (animationId !== null) {
            cancelAnimationFrame(animationId);
        }
    };
}

/**
 * Animate multiple values using spring physics
 */
export function animateSpringMultiple(
    from: number[],
    to: number[],
    config: SpringConfig,
    onUpdate: (values: number[]) => void,
    onComplete?: () => void
): () => void {
    const current = [...from];
    const velocity = from.map(() => 0);
    let animationId: number | null = null;
    let lastTime = performance.now();

    const threshold = 0.01;
    const velocityThreshold = 0.01;

    function tick(now: number) {
        const deltaTime = Math.min((now - lastTime) / 1000, 0.1);
        lastTime = now;

        let allComplete = true;

        for (let i = 0; i < current.length; i++) {
            [current[i], velocity[i]] = springStep(
                current[i],
                to[i],
                velocity[i],
                config,
                deltaTime
            );

            if (
                Math.abs(current[i] - to[i]) >= threshold ||
                Math.abs(velocity[i]) >= velocityThreshold
            ) {
                allComplete = false;
            }
        }

        onUpdate([...current]);

        if (allComplete) {
            onUpdate([...to]);
            onComplete?.();
        } else {
            animationId = requestAnimationFrame(tick);
        }
    }

    animationId = requestAnimationFrame(tick);

    return () => {
        if (animationId !== null) {
            cancelAnimationFrame(animationId);
        }
    };
}

/**
 * Ease-out cubic for non-spring animations
 */
export function easeOutCubic(t: number): number {
    return 1 - Math.pow(1 - t, 3);
}

/**
 * Clamp a value between min and max
 */
export function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}

/**
 * Linear interpolation
 */
export function lerp(from: number, to: number, t: number): number {
    return from + (to - from) * t;
}
