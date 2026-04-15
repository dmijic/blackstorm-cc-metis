// Metis Go-Tools HTTP Server
// Provides safe, scoped execution of: subfinder, httpx, naabu
// SECURITY: This server is internal-only (not internet-facing).
//
// The Laravel API is responsible for scope verification BEFORE calling this service.
// God mode (bypassing scope checks) is controlled by the METIS_GOD_MODE env var
// which is only settable by super-admin.

package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/exec"
	"strings"
	"time"
)

type Response struct {
	Status string      `json:"status"`
	Data   interface{} `json:"data,omitempty"`
	Error  string      `json:"error,omitempty"`
}

func writeJSON(w http.ResponseWriter, status int, resp Response) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(resp)
}

func runCommand(name string, args ...string) (string, error) {
	cmd := exec.Command(name, args...)
	cmd.Env = os.Environ()

	out, err := cmd.Output()
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(string(out)), nil
}

func healthHandler(w http.ResponseWriter, r *http.Request) {
	tools := map[string]bool{}
	for _, t := range []string{"subfinder", "httpx", "naabu", "nmap"} {
		_, err := exec.LookPath(t)
		tools[t] = err == nil
	}
	writeJSON(w, 200, Response{Status: "ok", Data: tools})
}

// POST /subfinder — {domain: "example.com"}
func subfinderHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, 405, Response{Status: "error", Error: "POST required"})
		return
	}
	var req struct {
		Domain string `json:"domain"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Domain == "" {
		writeJSON(w, 400, Response{Status: "error", Error: "domain required"})
		return
	}

	out, err := runCommand("subfinder", "-d", req.Domain, "-silent", "-timeout", "30")
	if err != nil {
		writeJSON(w, 500, Response{Status: "error", Error: err.Error()})
		return
	}

	subdomains := []string{}
	for _, line := range strings.Split(out, "\n") {
		line = strings.TrimSpace(line)
		if line != "" {
			subdomains = append(subdomains, line)
		}
	}

	writeJSON(w, 200, Response{Status: "ok", Data: map[string]interface{}{
		"domain":     req.Domain,
		"subdomains": subdomains,
		"count":      len(subdomains),
	}})
}

// POST /httpx — {hosts: ["example.com", "sub.example.com"]}
func httpxHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, 405, Response{Status: "error", Error: "POST required"})
		return
	}
	var req struct {
		Hosts []string `json:"hosts"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || len(req.Hosts) == 0 {
		writeJSON(w, 400, Response{Status: "error", Error: "hosts[] required"})
		return
	}

	input := strings.Join(req.Hosts, "\n")
	cmd := exec.Command("httpx",
		"-silent", "-json",
		"-status-code", "-title", "-server", "-tech-detect",
		"-timeout", "10", "-retries", "1",
	)
	cmd.Stdin = strings.NewReader(input)
	out, err := cmd.Output()
	if err != nil {
		writeJSON(w, 500, Response{Status: "error", Error: err.Error()})
		return
	}

	results := []map[string]interface{}{}
	for _, line := range strings.Split(string(out), "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		var item map[string]interface{}
		if err := json.Unmarshal([]byte(line), &item); err == nil {
			results = append(results, item)
		}
	}

	writeJSON(w, 200, Response{Status: "ok", Data: results})
}

// POST /naabu — {host: "example.com", ports: "80,443,8080,8443"}
func naabuHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, 405, Response{Status: "error", Error: "POST required"})
		return
	}
	var req struct {
		Host  string `json:"host"`
		Ports string `json:"ports"` // e.g. "80,443,8080" or "top-100"
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Host == "" {
		writeJSON(w, 400, Response{Status: "error", Error: "host required"})
		return
	}

	ports := req.Ports
	if ports == "" {
		ports = "80,443,8080,8443,22,21,3306,5432,6379,27017"
	}

	out, err := runCommand("naabu",
		"-host", req.Host,
		"-port", ports,
		"-silent", "-json",
		"-timeout", "3000",
	)
	if err != nil {
		writeJSON(w, 500, Response{Status: "error", Error: err.Error()})
		return
	}

	results := []map[string]interface{}{}
	for _, line := range strings.Split(out, "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		var item map[string]interface{}
		if err := json.Unmarshal([]byte(line), &item); err == nil {
			results = append(results, item)
		}
	}

	writeJSON(w, 200, Response{Status: "ok", Data: results})
}

func main() {
	port := os.Getenv("TOOLS_PORT")
	if port == "" {
		port = "9090"
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/health",    healthHandler)
	mux.HandleFunc("/subfinder", subfinderHandler)
	mux.HandleFunc("/httpx",     httpxHandler)
	mux.HandleFunc("/naabu",     naabuHandler)

	srv := &http.Server{
		Addr:         fmt.Sprintf(":%s", port),
		Handler:      mux,
		ReadTimeout:  120 * time.Second,
		WriteTimeout: 120 * time.Second,
	}

	log.Printf("Metis Tools Server listening on :%s (internal only)\n", port)
	log.Printf("God Mode: %s\n", os.Getenv("GOD_MODE"))
	log.Fatal(srv.ListenAndServe())
}
