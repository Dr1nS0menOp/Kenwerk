// SPDX-License-Identifier: Apache-2.0

package sites

import (
	"context"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kenwerk/kenwerk/internal/apperr"
)

var (
	uuidPattern  = regexp.MustCompile(`[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}`)
	emailPattern = regexp.MustCompile(`[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}`)
)

// scrub is the last line of defence (D17). It reads what was built and stops at the
// first instance address, API path, internal page id or user's e-mail address.
func (s *Service) scrub(ctx context.Context, dir string) error {
	files, err := textFiles(dir)
	if err != nil {
		return err
	}
	host := ""
	if u, err := url.Parse(s.options.Origin); err == nil {
		host = u.Host
	}
	for _, file := range files {
		data, err := os.ReadFile(file) // #nosec G304 -- textFiles lists the build this service just wrote below its own folder.
		if err != nil {
			return err
		}
		reason, err := s.findLeak(ctx, string(data), host)
		if err != nil {
			return err
		}
		if reason != "" {
			name, _ := filepath.Rel(dir, file)
			return apperr.Invalid(fmt.Sprintf("The build stopped: %s holds %s. The old site stays.", filepath.ToSlash(name), reason))
		}
	}
	return nil
}

func (s *Service) findLeak(ctx context.Context, text, host string) (string, error) {
	if host != "" && strings.Contains(text, host) {
		return "the address of this instance", nil
	}
	if strings.Contains(text, "/api/") {
		return "an API path", nil
	}
	pageID, err := s.holdsPageID(ctx, text)
	if err != nil {
		return "", err
	}
	if pageID {
		return "an internal page id", nil
	}
	userEmail, err := s.holdsUserEmail(ctx, text)
	if err != nil {
		return "", err
	}
	if userEmail {
		return "the e-mail address of a user", nil
	}
	return "", nil
}

// holdsPageID says whether text holds the id of a page of this instance.
func (s *Service) holdsPageID(ctx context.Context, text string) (bool, error) {
	for _, found := range uuidPattern.FindAllString(text, -1) {
		id, err := uuid.Parse(found)
		if err != nil {
			continue
		}
		var known bool
		if err := s.pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM pages WHERE id = $1)`, id).Scan(&known); err != nil {
			return false, err
		}
		if known {
			return true, nil
		}
	}
	return false, nil
}

// holdsUserEmail says whether text holds the e-mail address of a user, in any case.
func (s *Service) holdsUserEmail(ctx context.Context, text string) (bool, error) {
	addresses := emailPattern.FindAllString(text, -1)
	if len(addresses) == 0 {
		return false, nil
	}
	for i := range addresses {
		addresses[i] = strings.ToLower(addresses[i])
	}
	rows, err := s.pool.Query(ctx, `SELECT email FROM users WHERE lower(email) = ANY($1) LIMIT 1`, addresses)
	if err != nil {
		return false, err
	}
	found, err := pgx.CollectRows(rows, pgx.RowTo[string])
	if err != nil {
		return false, err
	}
	return len(found) > 0, nil
}
