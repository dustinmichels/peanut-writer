// Package atomicfile writes files whole or not at all.
package atomicfile

import (
	"os"
	"path/filepath"
)

// Write writes data to the file at p by renaming a new file in its folder
// over it, so p never holds part of data, and a symlink at p is replaced
// rather than written through: a document package from elsewhere can't aim
// a save at another file.
func Write(p string, data []byte, perm os.FileMode) error {
	f, err := os.CreateTemp(filepath.Dir(p), "."+filepath.Base(p)+".*")
	if err != nil {
		return err
	}
	tmp := f.Name()
	_, err = f.Write(data)
	if err == nil {
		err = f.Chmod(perm)
	}
	if cerr := f.Close(); err == nil {
		err = cerr
	}
	if err == nil {
		err = os.Rename(tmp, p)
	}
	if err != nil {
		os.Remove(tmp)
	}
	return err
}
