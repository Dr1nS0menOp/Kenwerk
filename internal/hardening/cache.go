// SPDX-License-Identifier: Apache-2.0

package hardening

import (
	"context"
	"sync"
	"time"
)

// Cache keeps the last overview of a node for a while, so every administrator who opens the
// overview or the summary within that time costs no statement of its own (the load budget of
// spec 088). The overview holds no name and nothing per person, so one answer serves everyone.
type Cache struct {
	// FreshFor is how long one reading is answered again.
	FreshFor time.Duration
	// Now is the clock; nil is the real one.
	Now func() time.Time

	mu     sync.Mutex
	readAt time.Time
	value  Overview
}

func (c *Cache) now() time.Time {
	if c.Now == nil {
		return time.Now()
	}
	return c.Now()
}

// Get answers the kept overview while it is fresh, and reads it again with read when it is not.
// A failed read keeps nothing, so the next call tries again.
func (c *Cache) Get(ctx context.Context, read func(context.Context, time.Time) (Overview, error)) (Overview, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	now := c.now()
	if !c.readAt.IsZero() && now.Sub(c.readAt) < c.FreshFor {
		return c.value, nil
	}
	v, err := read(ctx, now)
	if err != nil {
		return Overview{}, err
	}
	c.readAt, c.value = now, v
	return v, nil
}
