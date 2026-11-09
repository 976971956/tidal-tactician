import CoreGraphics
import Foundation
import ImageIO
import Vision

struct Token: Encodable {
    let text: String
    let x: Double
    let y: Double
    let width: Double
    let height: Double
}

struct Result: Encodable {
    let width: Int
    let height: Int
    let tokens: [Token]
}

func readTokens(_ image: CGImage, width: Int, height: Int) throws -> [Token] {
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.recognitionLanguages = ["zh-Hans", "en-US"]
    request.usesLanguageCorrection = false
    request.minimumTextHeight = 0.004
    try VNImageRequestHandler(cgImage: image).perform([request])

    let pattern = try NSRegularExpression(pattern: #"\p{Han}+|[0-9]+(?:[/／][0-9]+)?"#)
    var tokens: [Token] = []
    for observation in request.results ?? [] {
        guard let candidate = observation.topCandidates(1).first else { continue }
        let line = candidate.string
        for match in pattern.matches(in: line, range: NSRange(line.startIndex..., in: line)) {
            guard let range = Range(match.range, in: line),
                  let box = try? candidate.boundingBox(for: range) else { continue }
            let rect = box.boundingBox
            tokens.append(Token(
                text: String(line[range]),
                x: rect.midX * Double(width), y: (1 - rect.midY) * Double(height),
                width: rect.width * Double(width), height: rect.height * Double(height)
            ))
        }
    }
    return tokens
}

func recognize() throws -> Result {
    let data = FileHandle.standardInput.readDataToEndOfFile()
    guard let source = CGImageSourceCreateWithData(data as CFData, nil),
          let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
          let width = properties[kCGImagePropertyPixelWidth] as? Int,
          let height = properties[kCGImagePropertyPixelHeight] as? Int,
          (1...3200).contains(width), (1...3200).contains(height),
          let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else {
        throw CocoaError(.fileReadCorruptFile)
    }

    var tokens = try readTokens(image, width: width, height: height)
    // Small power badges can be skipped on the first pass. Keep the original
    // readings and use the enlarged image to fill gaps at other positions.
    if max(width, height) <= 1600,
       let context = CGContext(data: nil, width: width * 2, height: height * 2,
                               bitsPerComponent: 8, bytesPerRow: 0,
                               space: CGColorSpaceCreateDeviceRGB(),
                               bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) {
        context.interpolationQuality = .high
        context.draw(image, in: CGRect(x: 0, y: 0, width: width * 2, height: height * 2))
        if let enlarged = context.makeImage(), let extra = try? readTokens(enlarged, width: width, height: height) {
            for token in extra where !tokens.contains(where: {
                abs($0.x - token.x) < max($0.width, token.width) / 2 &&
                abs($0.y - token.y) < max($0.height, token.height) / 2
            }) {
                tokens.append(token)
            }
        }
    }
    return Result(width: width, height: height, tokens: tokens)
}

do {
    FileHandle.standardOutput.write(try JSONEncoder().encode(recognize()))
} catch {
    FileHandle.standardError.write(Data(String(describing: error).utf8))
    exit(1)
}
