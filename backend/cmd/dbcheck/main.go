package main

import (
	"database/sql"
	"fmt"
	"log"
	"os"

	_ "modernc.org/sqlite"
)

func main() {
	dbPath := "voip.db"
	if len(os.Args) > 1 {
		dbPath = os.Args[1]
	}
	conn, err := sql.Open("sqlite", dbPath)
	if err != nil {
		log.Fatalf("open: %v", err)
	}
	defer conn.Close()

	fmt.Println("--- users ---")
	rows, err := conn.Query("SELECT id, username, extension, status, is_online FROM users ORDER BY id")
	if err != nil {
		log.Fatalf("users: %v", err)
	}
	for rows.Next() {
		var id int
		var username, ext, status string
		var online bool
		if err := rows.Scan(&id, &username, &ext, &status, &online); err != nil {
			log.Fatal(err)
		}
		fmt.Printf("id=%d username=%s ext=%s status=%s online=%v\n", id, username, ext, status, online)
	}
	rows.Close()

	fmt.Println("--- messages (last 20) ---")
	mrows, err := conn.Query("SELECT id, sender_id, receiver_id, content, msg_type, is_read, delivered_at, read_at, created_at FROM messages ORDER BY id DESC LIMIT 20")
	if err != nil {
		log.Fatalf("messages: %v", err)
	}
	for mrows.Next() {
		var id, s, r int
		var content, mtype string
		var isRead int
		var delivered, read, created sql.NullString
		if err := mrows.Scan(&id, &s, &r, &content, &mtype, &isRead, &delivered, &read, &created); err != nil {
			log.Fatal(err)
		}
		ds, _ := delivered.Value()
		rs, _ := read.Value()
		fmt.Printf("id=%d sender=%d receiver=%d content=%q type=%s is_read=%d delivered=%v read=%v created=%v\n",
			id, s, r, content, mtype, isRead, ds, rs, created.String)
	}
	mrows.Close()
}
