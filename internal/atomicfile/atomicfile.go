// Package atomicfile writes files whole or not at all.
package atomicfile

import (
	"errors"
	"io/fs"
	"os"
	"path/filepath"
)

// Write writes data to the file at p by renaming a new file in its folder
// over it, so p never holds part of data, and a symlink at p is replaced
// rather than written through: a document package from elsewhere can't aim
// a save at another file. A file already at p keeps its permissions; perm is
// a new one's. An error names p, not the hidden temporary file.
func Write(p string, data []byte, perm os.FileMode) error {
	if fi, err := os.Lstat(p); err == nil && fi.Mode().IsRegular() {
		perm = fi.Mode().Perm()
	}
	f, err := os.CreateTemp(filepath.Dir(p), "."+filepath.Base(p)+".*")
	if err != nil {
		return failed(p, err)
	}
	tmp := f.Name()
	_, err = f.Write(data)
	if err == nil {
		err = f.Chmod(perm)
	}
	if err == nil {
		// On disk before it replaces p, so a crash can't leave p empty.
		err = f.Sync()
	}
	if cerr := f.Close(); err == nil {
		err = cerr
	}
	if err == nil {
		err = os.Rename(tmp, p)
	}
	if err != nil {
		os.Remove(tmp)
		return failed(p, err)
	}
	return nil
}

// failed is err as an error writing p.
func failed(p string, err error) error {
	var pe *fs.PathError
	var le *os.LinkError
	switch {
	case errors.As(err, &pe):
		err = pe.Err
	case errors.As(err, &le):
		err = le.Err
	}
	return &fs.PathError{Op: "write", Path: p, Err: err}
}
