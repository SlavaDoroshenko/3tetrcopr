using System;
using System.Collections.Generic;
using System.Net;
using System.Net.Http;
using System.Text;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Threading;
using System.Text.Json;
using System.IO;
using System.Threading;
using System.Linq;

namespace HttpServerApp;

/// <summary>
/// Interaction logic for MainWindow.xaml
/// </summary>
public partial class MainWindow : Window
{
    private HttpListener? httpListener;
    private bool isServerRunning;
    private readonly HttpClient httpClient;
    private readonly DispatcherTimer monitoringTimer;
    private readonly List<RequestLog> requestLogs;
    private readonly string logFilePath = "logs.txt";
    private readonly object lockObject = new object();
    private DateTime serverStartTime;

    public MainWindow()
    {
        InitializeComponent();
        httpClient = new HttpClient();
        requestLogs = new List<RequestLog>();
        
        // Инициализация таймера для мониторинга
        monitoringTimer = new DispatcherTimer();
        monitoringTimer.Interval = TimeSpan.FromSeconds(1);
        monitoringTimer.Tick += MonitoringTimer_Tick;
        
        // Загрузка сохраненных логов
        LoadLogs();
    }

    private void LoadLogs()
    {
        if (File.Exists(logFilePath))
        {
            try
            {
                var logs = File.ReadAllLines(logFilePath);
                foreach (var log in logs)
                {
                    ServerLogTextBox.AppendText(log + Environment.NewLine);
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Ошибка при загрузке логов: {ex.Message}");
            }
        }
    }

    private async void StartServerButton_Click(object sender, RoutedEventArgs e)
    {
        if (!isServerRunning)
        {
            if (!int.TryParse(PortTextBox.Text, out int port))
            {
                MessageBox.Show("Пожалуйста, введите корректный номер порта");
                return;
            }

            try
            {
                httpListener = new HttpListener();
                httpListener.Prefixes.Add($"http://localhost:{port}/");
                httpListener.Start();
                isServerRunning = true;
                serverStartTime = DateTime.Now;
                StartServerButton.Content = "Остановить сервер";
                monitoringTimer.Start();

                ServerLogTextBox.AppendText($"Сервер запущен на порту {port}{Environment.NewLine}");
                await StartListening();
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Ошибка при запуске сервера: {ex.Message}");
            }
        }
        else
        {
            StopServer();
        }
    }

    private void StopServer()
    {
        if (httpListener != null && httpListener.IsListening)
        {
            httpListener.Stop();
            httpListener.Close();
            isServerRunning = false;
            StartServerButton.Content = "Запустить сервер";
            monitoringTimer.Stop();
            ServerLogTextBox.AppendText("Сервер остановлен" + Environment.NewLine);
        }
    }

    private async Task StartListening()
    {
        while (isServerRunning)
        {
            try
            {
                var context = await httpListener!.GetContextAsync();
                _ = ProcessRequestAsync(context);
            }
            catch (Exception ex)
            {
                LogError($"Ошибка при обработке запроса: {ex.Message}");
            }
        }
    }

    private async Task ProcessRequestAsync(HttpListenerContext context)
    {
        var request = context.Request;
        var response = context.Response;
        
        // Добавляем заголовки CORS
        response.Headers.Add("Access-Control-Allow-Origin", "*");
        response.Headers.Add("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        response.Headers.Add("Access-Control-Allow-Headers", "Content-Type");
        
        // Обрабатываем preflight запрос
        if (request.HttpMethod == "OPTIONS")
        {
            response.StatusCode = 200;
            response.Close();
            return;
        }

        var requestLog = new RequestLog
        {
            Timestamp = DateTime.Now,
            Method = request.HttpMethod,
            Url = request.Url?.ToString() ?? "unknown",
            StatusCode = response.StatusCode
        };

        try
        {
            string responseString;
            if (request.HttpMethod == "GET")
            {
                responseString = await HandleGetRequest(request);
            }
            else if (request.HttpMethod == "POST")
            {
                using var reader = new StreamReader(request.InputStream);
                var body = await reader.ReadToEndAsync();
                responseString = await HandlePostRequest(body);
            }
            else
            {
                response.StatusCode = 405;
                responseString = "Метод не поддерживается";
            }

            var buffer = Encoding.UTF8.GetBytes(responseString);
            response.ContentLength64 = buffer.Length;
            response.ContentType = "application/json";
            await response.OutputStream.WriteAsync(buffer, 0, buffer.Length);
        }
        catch (Exception ex)
        {
            response.StatusCode = 500;
            var errorBuffer = Encoding.UTF8.GetBytes($"Ошибка сервера: {ex.Message}");
            response.ContentLength64 = errorBuffer.Length;
            await response.OutputStream.WriteAsync(errorBuffer, 0, errorBuffer.Length);
        }
        finally
        {
            response.Close();
        }

        // Логируем запрос только если это не запрос мониторинга
        if (request.Url?.PathAndQuery != "/stats")
        {
            LogRequest(requestLog);
        }
    }

    private Task<string> HandleGetRequest(HttpListenerRequest request)
    {
        if (request.Url?.PathAndQuery == "/stats")
        {
            return HandleGetRequest();
        }
        else
        {
            return Task.FromResult(JsonSerializer.Serialize(new { message = "Сервер работает" }));
        }
    }

    private Task<string> HandleGetRequest()
    {
        var uptime = DateTime.Now - serverStartTime;
        var stats = new
        {
            TotalRequests = requestLogs.Count,
            GetRequests = requestLogs.Count(r => r.Method == "GET"),
            PostRequests = requestLogs.Count(r => r.Method == "POST"),
            Uptime = new
            {
                TotalSeconds = uptime.TotalSeconds,
                TotalMinutes = uptime.TotalMinutes,
                TotalHours = uptime.TotalHours
            },
            ServerStartTime = serverStartTime.ToString("yyyy-MM-dd HH:mm:ss"),
            StatusCodes = requestLogs
                .GroupBy(r => r.StatusCode)
                .Select(g => new { StatusCode = g.Key, Count = g.Count() })
                .ToList(),
            RequestHistory = requestLogs
                .Select(log => new
                {
                    Timestamp = log.Timestamp,
                    Method = log.Method,
                    StatusCode = log.StatusCode,
                    TimeFromStart = (log.Timestamp - serverStartTime).TotalSeconds
                })
                .OrderBy(x => x.Timestamp)
                .ToList()
        };

        return Task.FromResult(JsonSerializer.Serialize(stats));
    }

    private Task<string> HandlePostRequest(string body)
    {
        try
        {
            var message = JsonSerializer.Deserialize<MessageRequest>(body);
            var response = new { Id = Guid.NewGuid(), Message = message?.Message ?? "No message" };
            return Task.FromResult(JsonSerializer.Serialize(response));
        }
        catch
        {
            throw new Exception("Неверный формат JSON");
        }
    }

    private async void SendRequestButton_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            var url = UrlTextBox.Text;
            var method = (MethodComboBox.SelectedItem as ComboBoxItem)?.Content.ToString() ?? "GET";
            var content = RequestBodyTextBox.Text;

            using var request = new HttpRequestMessage(new HttpMethod(method), url);
            
            if (method == "POST" && !string.IsNullOrEmpty(content))
            {
                request.Content = new StringContent(content, Encoding.UTF8, "application/json");
            }

            var response = await httpClient.SendAsync(request);
            var responseContent = await response.Content.ReadAsStringAsync();
            ResponseTextBox.Text = responseContent;
        }
        catch (Exception ex)
        {
            ResponseTextBox.Text = $"Ошибка: {ex.Message}";
        }
    }

    private void ViewGraphsButton_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            var monitoringAppPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "..", "..", "..", "..", "monitoring-app");
            if (!Directory.Exists(monitoringAppPath))
            {
                MessageBox.Show("Директория monitoring-app не найдена");
                return;
            }

            var process = new System.Diagnostics.Process();
            process.StartInfo.FileName = "cmd.exe";
            process.StartInfo.Arguments = "/c npm install && npm run dev";
            process.StartInfo.WorkingDirectory = monitoringAppPath;
            process.StartInfo.UseShellExecute = false;
            process.StartInfo.RedirectStandardOutput = true;
            process.StartInfo.RedirectStandardError = true;
            process.StartInfo.CreateNoWindow = false;
            process.Start();

            // Открываем браузер после небольшой задержки
            Task.Delay(5000).ContinueWith(_ =>
            {
                System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo
                {
                    FileName = "http://localhost:3000",
                    UseShellExecute = true
                });
            });
        }
        catch (Exception ex)
        {
            MessageBox.Show($"Ошибка при запуске React приложения: {ex.Message}");
        }
    }

    private void MonitoringTimer_Tick(object? sender, EventArgs e)
    {
        // Обновление статистики
        UpdateStatistics();
    }

    private void UpdateStatistics()
    {
        // Здесь будет код для обновления статистики
    }

    private void LogRequest(RequestLog log)
    {
        lock (lockObject)
        {
            requestLogs.Add(log);
            var logMessage = $"{log.Timestamp:yyyy-MM-dd HH:mm:ss} - {log.Method} {log.Url} - {log.StatusCode}";
            ServerLogTextBox.Dispatcher.Invoke(() =>
            {
                ServerLogTextBox.AppendText(logMessage + Environment.NewLine);
            });
            File.AppendAllText(logFilePath, logMessage + Environment.NewLine);
        }
    }

    private void LogError(string message)
    {
        ServerLogTextBox.Dispatcher.Invoke(() =>
        {
            ServerLogTextBox.AppendText($"ERROR: {message}{Environment.NewLine}");
        });
    }
}

public class RequestLog
{
    public DateTime Timestamp { get; set; }
    public required string Method { get; set; }
    public required string Url { get; set; }
    public int StatusCode { get; set; }
}

public class MessageRequest
{
    public required string Message { get; set; }
}