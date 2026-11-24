// SPDX-License-Identifier: Apache-2.0

package hardening

import (
	"context"
	"errors"
	"testing"
	"time"
)

// A clock the test moves.
type clock struct{ at time.Time }

func (c *clock) now() time.Time { return c.at }

func TestTheOverviewIsReadOncePerHalfMinute(t *testing.T) {
	c := &clock{at: now}
	cache := Cache{FreshFor: 30 * time.Second, Now: c.now}
	reads := 0
	read := func(_ context.Context, at time.Time) (Overview, error) {
		reads++
		return Overview{AsOf: at}, nil
	}
	ctx := context.Background()
	if _, err := cache.Get(ctx, read); err != nil {
		t.Fatal(err)
	}
	c.at = now.Add(30*time.Second - time.Nanosecond)
	got, err := cache.Get(ctx, read)
	if err != nil || reads != 1 || !got.AsOf.Equal(now) {
		t.Fatalf("a second read within half a minute: %d reads, %v, %v", reads, got.AsOf, err)
	}
	c.at = now.Add(30 * time.Second)
	if got, _ := cache.Get(ctx, read); reads != 2 || !got.AsOf.Equal(c.at) {
		t.Fatalf("a read after half a minute: %d reads, %v", reads, got.AsOf)
	}
}

func TestAFailedReadIsKeptForNobody(t *testing.T) {
	cache := Cache{FreshFor: time.Minute}
	failed := errors.New("the database did not answer")
	if _, err := cache.Get(context.Background(), func(context.Context, time.Time) (Overview, error) {
		return Overview{Attention: 9}, failed
	}); !errors.Is(err, failed) {
		t.Fatalf("the failure is not passed on: %v", err)
	}
	got, err := cache.Get(context.Background(), func(context.Context, time.Time) (Overview, error) {
		return Overview{Attention: 1}, nil
	})
	if err != nil || got.Attention != 1 {
		t.Fatalf("a read after a failure: %+v %v", got, err)
	}
}
