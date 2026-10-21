import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;

public final class Cache {
    static String handle(String line) {
        if (line.equals("STATS")) return "STATS items=0 bytes=0 hits=0 misses=0 evictions=0 expired=0";
        return "ERR not_implemented";
    }

    static void serve(Socket s) {
        try (s) {
            BufferedReader in = new BufferedReader(new InputStreamReader(s.getInputStream(), StandardCharsets.ISO_8859_1));
            OutputStream out = s.getOutputStream();
            String line;
            while ((line = in.readLine()) != null) {
                out.write((handle(line) + "\n").getBytes(StandardCharsets.ISO_8859_1));
                out.flush();
            }
        } catch (IOException ignored) {
        }
    }

    public static void main(String[] args) throws IOException {
        int port = 0;
        for (int i = 0; i + 1 < args.length; i++) {
            if (args[i].equals("--port")) port = Integer.parseInt(args[i + 1]);
        }
        try (ServerSocket ss = new ServerSocket(port, 1024, InetAddress.getLoopbackAddress())) {
            while (true) {
                Socket s = ss.accept();
                Thread.ofVirtual().start(() -> serve(s));
            }
        }
    }
}
