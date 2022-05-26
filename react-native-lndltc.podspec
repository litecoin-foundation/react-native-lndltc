require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "react-native-lndltc"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.description  = <<-DESC
                  react-native-lndltc
                   DESC
  s.homepage     = "https://github.com/litecoin-foundation/react-native-lndltc"
  s.license      = "MIT"
  s.authors      = { "litecoinfoundation" => "losh11@litecoin.net" }
  s.platforms    = { :ios => "9.0" }
  s.source       = { :git => "https://github.com/litecoin-foundation/react-native-lndltc.git", :tag => "#{s.version}" }

  s.source_files = "ios/**/*.{h,m,swift}"
  s.requires_arc = true

  s.vendored_frameworks = 'ios/Lndmobile.xcframework'
  s.dependency "React"
end
