// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::net::TcpListener;

fn main() {
  let port = if cfg!(debug_assertions) {
    3000
  } else {
    let listener = TcpListener::bind("127.0.0.1:0").expect("failed to reserve backend port");
    let port = listener
      .local_addr()
      .expect("failed to read reserved backend port")
      .port();
    drop(listener);
    port
  };
  app_lib::run(port);
}
